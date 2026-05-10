import { Command } from '../types/command';
import Claude from './claude';
import Emote from './emote';
import Play from './play';
import ServerEmoji from './serverEmoji';
import Sfx from './sfx';
import Stop from './stop';

/**
 * All bot commands except `/help`. The `/help` handler imports this registry
 * to build its command listing, so keeping Help out avoids a circular import
 * between `commands.ts` and `commands/help.ts`.
 */
export const COMMAND_REGISTRY: Command[] = [Sfx, Play, Stop, Emote, ServerEmoji, Claude];
