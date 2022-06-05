import { generateDependencyReport } from '@discordjs/voice';
import * as Config from './config.json' assert {type: 'json'};
import Botnek from './bot.js';
import log from './logging/logging.js';

const botnek = new Botnek(Config.default);

log.info(generateDependencyReport());
botnek.login(Config.default.token);
