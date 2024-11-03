import { generateDependencyReport } from '@discordjs/voice';
import Botnek from './bot';
import * as Config from './config.json' with { type: 'json' };
import log from './logging/logging';

log.info(generateDependencyReport());

const botnek = new Botnek(Config);

await botnek.login(Config.token);
