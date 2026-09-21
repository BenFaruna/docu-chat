import { EventEmitter } from 'events';


const appEvents = new EventEmitter();

appEvents.setMaxListeners(20);

export { appEvents };