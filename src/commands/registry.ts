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
 * Single source of truth for the bot's command set, MINUS `/help`. Both the dispatcher
 * (src/commands.ts) and the help-embed builder (src/commands/help.ts) read from here, so
 * adding a new user-facing command is a one-line addition to this array — no need to also
 * remember to edit a separate help listing the way the pre-cleanup version required.
 *
 * `/help` itself is appended in src/commands.ts to avoid a circular import: help.ts imports
 * COMMAND_REGISTRY to render its listing.
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
