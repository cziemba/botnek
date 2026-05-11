// Public dispatch table assembled from the registry plus `/help`. Help lives in its own module
// (commands/help.ts) and imports COMMAND_REGISTRY directly to build its embed — keeping it out
// of the registry is what breaks the otherwise-circular import (commands.ts -> help -> registry).
import { Help } from './commands/help';
import { COMMAND_REGISTRY } from './commands/registry';
import { Command } from './types/command';

const COMMANDS: Command[] = [...COMMAND_REGISTRY, Help];

export default COMMANDS;
