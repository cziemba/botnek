import { Help } from './commands/help';
import { COMMAND_REGISTRY } from './commands/registry';
import { Command } from './types/command';

const COMMANDS: Command[] = [...COMMAND_REGISTRY, Help];

export default COMMANDS;
