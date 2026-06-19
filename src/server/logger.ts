import pino from 'pino';
import { env, isProduction } from './env.js';

export const logger = pino({
  level: isProduction ? 'info' : 'debug',
  base: { service: 'agent-finder', env: env.NODE_ENV },
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password'],
});
