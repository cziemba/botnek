import { pino } from 'pino';

const log = pino({
    level: 'trace',
});

export default log;
