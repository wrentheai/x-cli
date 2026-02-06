import chalk from 'chalk';
import { loadConfig, setDefaultAccount } from '../config.js';

export async function defaultCommand(name?: string): Promise<void> {
  try {
    const config = loadConfig();

    if (!name) {
      if (config.defaultAccount) {
        const info = config.accounts[config.defaultAccount];
        const handle = info?.handle ? ` (${info.handle})` : '';
        console.log(`Default account: ${chalk.bold(config.defaultAccount)}${chalk.gray(handle)}`);
      } else {
        console.log(chalk.yellow('No default account set.'));
      }
      return;
    }

    setDefaultAccount(name);
    const info = config.accounts[name];
    const handle = info?.handle ? ` (${info.handle})` : '';
    console.log(chalk.green(`✓ Default account set to ${chalk.bold(name)}${chalk.gray(handle)}`));
  } catch (error) {
    console.error(chalk.red(String(error instanceof Error ? error.message : error)));
    process.exit(1);
  }
}
