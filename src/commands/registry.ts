import { Command } from '../types/command';
import Claude from './claude';
import Emote from './emote';
import Pause from './pause';
import Play from './play';
import Queue from './queue';
import Resume from './resume';
import ServerEmoji from './serverEmoji';
import Sfx from './sfx';
import Skip from './skip';
import Stop from './stop';

/**
 * All bot commands except `/help`. The `/help` handler imports this registry
 * to build its command listing, so keeping Help out avoids a circular import
 * between `commands.ts` and `commands/help.ts`.
 */
export const COMMAND_REGISTRY: Command[] = [
    Sfx,
    Play,
    Stop,
    Skip,
    Pause,
    Resume,
    Queue,
    Emote,
    ServerEmoji,
    Claude,
];
