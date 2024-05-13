import { generateDependencyReport } from '@discordjs/voice';
import * as Config from './config.json' with {type: 'json'};
import Botnek from './bot.ts';
import log from './logging/logging.ts';

log.info(generateDependencyReport());

const botnek = new Botnek(Config.default);

await botnek.login(Config.default.token);
