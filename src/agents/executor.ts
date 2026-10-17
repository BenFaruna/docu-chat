// src/agents/executor.ts
import { TOOL_REGISTRY, getToolSchemas } from './tools/registry';
import { openaiBreaker } from '../lib/http/openai.breaker';
import { logger } from '../lib/logger';
import { appEvents } from '../lib/events';
import { AGENT_SYSTEM_PROMPT } from '../config/prompt';

interface AgentConfig {
    maxIterations: number;
    timeoutMs: number;
    costCeilingUsd: number;
    model: string;
}

interface AgentResult {
    answer: string;
    sources: string[];
    confidence: string;
    iterations: number;
    totalCostUsd: number;
    terminationReason: 'completed' | 'iteration_limit' | 'timeout' | 'cost_limit' | 'error';
    trace: TraceStep[];
}

interface TraceStep {
    step: number;
    phase: 'think' | 'act' | 'observe';
    tool?: string;
    input?: any;
    output?: any;
    durationMs: number;
    costUsd: number;
}

const DEFAULT_CONFIG: AgentConfig = {
    maxIterations: 10,
    timeoutMs: 60_000,
    costCeilingUsd: 0.50,
    model: 'gpt-4o',
};


export async function runAgent(options: {
    question: string;
    userId: string;
    correlationId: string;
    config?: Partial<AgentConfig>;
}): Promise<AgentResult> {
    const config = { ...DEFAULT_CONFIG, ...options.config };
    const { question, userId, correlationId } = options;

    const trace: TraceStep[] = [];
    let totalCostUsd = 0;
    let iteration = 0;
    const startTime = Date.now();

    // Build the conversation with the LLM
    const messages: any[] = [
        { role: 'system', content: AGENT_SYSTEM_PROMPT },
        { role: 'user', content: question },
    ];

    const toolSchemas = getToolSchemas();

    logger.info({
        correlationId, question: question.substring(0, 100),
        maxIterations: config.maxIterations,
        costCeiling: config.costCeilingUsd,
    }, 'Agent started');

    while (iteration < config.maxIterations) {
        // ── CHECK TIMEOUT ──
        const elapsed = Date.now() - startTime;
        if (elapsed > config.timeoutMs) {
            logger.warn({ correlationId, iteration, elapsed }, 'Agent timeout');
            const result = buildResult('timeout', trace, totalCostUsd, iteration);
            appEvents.emit('agent:completed', {
                userId,
                correlationId,
                iterations: result.iterations,
                totalCostUsd: result.totalCostUsd,
                terminationReason: result.terminationReason,
                toolsUsed: result.trace
                    .filter(s => s.tool)
                    .map(s => s.tool),
                confidence: result.confidence,
                durationMs: Date.now() - startTime,
            });
            return result
        }

        // ── CHECK COST ──
        if (totalCostUsd >= config.costCeilingUsd) {
            logger.warn({
                correlationId, iteration, totalCostUsd,
            }, 'Agent cost ceiling hit');
            const result = buildResult('cost_limit', trace, totalCostUsd, iteration);
            appEvents.emit('agent:completed', {
                userId,
                correlationId,
                iterations: result.iterations,
                totalCostUsd: result.totalCostUsd,
                terminationReason: result.terminationReason,
                toolsUsed: result.trace
                    .filter(s => s.tool)
                    .map(s => s.tool),
                confidence: result.confidence,
                durationMs: Date.now() - startTime,
            });
            return result
        }

        iteration++;
        const stepStart = Date.now();

        // ── THINK: Ask the model what to do ──
        const response = await openaiBreaker.fire('/chat/completions', {
            model: config.model,
            messages,
            tools: toolSchemas,
            tool_choice: 'auto',
            temperature: 0.1,
        });

        const usage = response.data.usage;
        const stepCost =
            (usage.prompt_tokens / 1_000_000) * 2.50 +
            (usage.completion_tokens / 1_000_000) * 10.00;
        totalCostUsd += stepCost;

        const choice = response.data.choices[0];
        const assistantMessage = choice.message;

        // Add the assistant's response to conversation
        messages.push(assistantMessage);

        // ── NO TOOL CALL: Model wants to respond directly ──
        if (!assistantMessage.tool_calls ||
            assistantMessage.tool_calls.length === 0) {
            trace.push({
                step: iteration, phase: 'think',
                output: assistantMessage.content,
                durationMs: Date.now() - stepStart, costUsd: stepCost,
            });

            // Treat direct response as final answer
            return {
                answer: assistantMessage.content,
                sources: [],
                confidence: 'medium',
                iterations: iteration,
                totalCostUsd,
                terminationReason: 'completed',
                trace,
            };
        }

        // ── ACT: Execute each tool call ──
        for (const toolCall of assistantMessage.tool_calls) {
            const toolName = toolCall.function.name;
            const toolArgs = JSON.parse(toolCall.function.arguments);

            logger.info({
                correlationId, iteration, tool: toolName,
                args: toolArgs,
            }, 'Agent tool call');

            // Validate: is this tool in the registry?
            const tool = TOOL_REGISTRY[toolName];
            if (!tool) {
                const errorResult = {
                    role: 'tool' as const,
                    tool_call_id: toolCall.id,
                    content: `Error: unknown tool "${toolName}"`,
                };
                messages.push(errorResult);
                trace.push({
                    step: iteration, phase: 'act', tool: toolName,
                    input: toolArgs,
                    output: { error: 'Unknown tool' },
                    durationMs: Date.now() - stepStart, costUsd: stepCost,
                });
                continue;
            }

            // Check for final_answer
            if (toolName === 'final_answer') {
                trace.push({
                    step: iteration, phase: 'act', tool: 'final_answer',
                    input: toolArgs,
                    durationMs: Date.now() - stepStart, costUsd: stepCost,
                });

                const result = buildResult('completed', trace, totalCostUsd, iteration);
                result.answer = toolArgs.answer;
                result.sources = toolArgs.sources || [];
                result.confidence = toolArgs.confidence || 'medium';
                result.iterations = iteration;

                appEvents.emit('agent:completed', {
                    userId,
                    correlationId,
                    iterations: result.iterations,
                    totalCostUsd: result.totalCostUsd,
                    terminationReason: result.terminationReason,
                    toolsUsed: result.trace
                        .filter(s => s.tool)
                        .map(s => s.tool),
                    confidence: result.confidence,
                    durationMs: Date.now() - startTime,
                });
                return result
            }

            // Validate inputs
            const validation = tool.parameters.safeParse(toolArgs);
            if (!validation.success) {
                const errorResult = {
                    role: 'tool' as const,
                    tool_call_id: toolCall.id,
                    content: `Validation error: ${validation.error.message}`,
                };
                messages.push(errorResult);
                continue;
            }

            // Execute the tool
            try {
                const result = await tool.handler(
                    validation.data,
                    { userId, correlationId }
                );

                // ── OBSERVE: Feed result back to the model ──
                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(result.data),
                });

                trace.push({
                    step: iteration, phase: 'observe', tool: toolName,
                    input: toolArgs, output: result.data,
                    durationMs: Date.now() - stepStart, costUsd: stepCost,
                });
            } catch (error) {
                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: `Tool error: ${(error as Error).message}`,
                });
                trace.push({
                    step: iteration, phase: 'observe', tool: toolName,
                    input: toolArgs,
                    output: { error: (error as Error).message },
                    durationMs: Date.now() - stepStart, costUsd: stepCost,
                });
            }
        }
    }

    // Iteration limit reached
    logger.warn({
        correlationId, iterations: iteration, totalCostUsd,
    }, 'Agent iteration limit');
    const result = buildResult('iteration_limit', trace, totalCostUsd, iteration);
    appEvents.emit('agent:completed', {
        userId,
        correlationId,
        iterations: result.iterations,
        totalCostUsd: result.totalCostUsd,
        terminationReason: result.terminationReason,
        toolsUsed: result.trace
            .filter(s => s.tool)
            .map(s => s.tool),
        confidence: result.confidence,
        durationMs: Date.now() - startTime,
    });
    return result
}

function buildResult(
    reason: AgentResult['terminationReason'],
    trace: TraceStep[],
    costUsd: number,
    iterations: number
): AgentResult {
    // Try to extract a partial answer from the trace
    const lastObserve = [...trace]
        .reverse()
        .find(s => s.phase === 'observe' && s.output);

    return {
        answer: `I was unable to complete my analysis (${reason}). ` +
            (lastObserve
                ? 'Here is what I found so far: ' + JSON.stringify(lastObserve.output)
                : 'No partial results are available.'),
        sources: [],
        confidence: 'low',
        iterations,
        totalCostUsd: costUsd,
        terminationReason: reason,
        trace,
    };
}

