import { describe, it, expect, beforeAll } from 'vitest';
import { semanticSearch } from '../../src/services/search.service';
// import { faker } from '@faker-js/faker';
// import { prisma } from '../../src/lib/prisma';

describe('RAG retrieval quality', () => {
    // Assume test documents are already ingested
    // with known content about specific topics

    let testUserId: string = 'clv12p15l000611646k665916';
    let testDocumentId: string = 'clv1611d7001b11649g379784';
    let otherUserId: string = 'clv12p15l111611646k665916';
    let otherDocumentId: string = 'clv12p15l000111646k665916';

    // beforeAll(async () => {
    //     testUserId = faker.string.uuid();
    //     testUser = await prisma.user.create({
    //         data: {
    //             id: testUserId,
    //             email: faker.internet.email(),
    //             name: faker.person.fullName(),
    //             passwordHash: faker.internet.password(),
    //         },
    //     });
    //     otherUserId = faker.string.uuid();
    //     otherUser = await prisma.user.create({
    //         data: {
    //             id: otherUserId,
    //             email: faker.internet.email(),
    //             name: faker.person.fullName(),
    //             passwordHash: faker.internet.password(),
    //         },
    //     });
    //     const testDocument = await prisma.document.create({
    //         data: {
    //             id: faker.string.uuid(),
    //             title: 'Refund Policy',
    //             content: 'You can return a product within 30 days of purchase.',
    //             userId: testUserId,
    //             filename: faker.lorem.words(3),
    //             status: "ready"
    //         },
    //     });
    //     testDocumentId = testDocument.id;
    // });

    it('finds the refund policy when asked about returns', { timeout: 10000 }, async () => {
        const results = await semanticSearch({
            query: 'How do I return a product?',
            userId: testUserId,
            correlationId: 'test-correlation-id'
        });

        expect(results.length).toBeGreaterThan(0);
        expect(results[0].score).toBeGreaterThan(0.5);

        // The top result should contain refund-related content
        const topContent = results[0].content.toLowerCase();
        expect(
            topContent.includes('return') ||
            topContent.includes('refund') ||
            topContent.includes('reimbursement')
        ).toBe(true);
    });

    it('returns low scores for irrelevant questions', { timeout: 10000 }, async () => {
        const results = await semanticSearch({
            query: 'What is quantum computing?',
            userId: testUserId,
            minScore: 0.5,
            correlationId: 'test-correlation-id'
        });

        // Should return nothing if documents are about company policies
        expect(results.length).toBe(0);
    });

    it('respects document ownership', { timeout: 10000 }, async () => {
        const results = await semanticSearch({
            query: 'return policy',
            userId: otherUserId, // Different user
            correlationId: 'test-correlation-id'
        });

        // Should not find testUser's documents
        const hasTestUserDocs = results.some(
            r => r.documentId === testDocumentId
        );
        expect(hasTestUserDocs).toBe(false);
    });
});
