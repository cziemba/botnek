import { generateDependencyReport } from '@discordjs/voice';
import Botnek from './bot';
import configJson from './config.json' with { type: 'json' };
import log from './logging/logging';

log.info(generateDependencyReport());

const botnek = new Botnek(configJson);

await botnek.login(configJson.token);
