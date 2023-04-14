import { generateDependencyReport } from '@discordjs/voice';
import * as Config from './config.json' assert {type: 'json'};
import Botnek from './bot.ts';
import log from './logging/logging.ts';

const botnek = new Botnek(Config.default);

log.info(generateDependencyReport());
await botnek.login(Config.default.token);
