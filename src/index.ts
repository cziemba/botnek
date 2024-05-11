import { generateDependencyReport } from '@discordjs/voice';
import * as Config from './config.json' with {type: 'json'};
import Botnek from './bot.ts';
import log from './logging/logging.ts';

// process.on('uncaughtException', (error) => log.error(error));
log.info(generateDependencyReport());

const botnek = new Botnek(Config.default);

await botnek.login(Config.default.token);
