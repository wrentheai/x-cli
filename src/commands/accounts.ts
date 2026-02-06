import chalk from 'chalk';
import { listAccounts } from '../config.js';

export async function accountsCommand(): Promise<void> {
  const accounts = listAccounts();

  if (accounts.length === 0) {
    console.log(chalk.yellow('No accounts configured. Run: x-cli login <name>'));
    return;
  }

  console.log('');
  console.log(chalk.bold('Accounts:'));
  console.log('');

  for (const account of accounts) {
    const marker = account.isDefault ? chalk.green(' (default)') : '';
    const handle = account.handle ? chalk.gray(` ${account.handle}`) : '';
    console.log(`  ${chalk.bold(account.name)}${handle}${marker}`);
  }
  console.log('');
}
