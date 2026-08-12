import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const configDirectory = fileURLToPath(new URL('../.wrangler-config/', import.meta.url));
const childEnv = {
  ...process.env,
  XDG_CONFIG_HOME: configDirectory,
  WRANGLER_LOG_PATH: `${configDirectory}/wrangler.log`,
};

const migration = spawnSync(npm, ['--prefix', 'worker', 'run', 'migrate:local'], {
  stdio: 'inherit',
  env: childEnv,
});

if (migration.status !== 0) {
  console.error('本地 D1 初始化失败，请检查 worker/wrangler.toml。');
  process.exit(migration.status ?? 1);
}

const children = [
  spawn(npm, ['--prefix', 'worker', 'run', 'dev'], { stdio: 'inherit', env: childEnv }),
  spawn(npm, ['--prefix', 'frontend', 'run', 'dev'], { stdio: 'inherit', env: childEnv }),
];

let stopping = false;
const stop = (signal = 'SIGTERM') => {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill(signal));
};

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
children.forEach((child) => child.on('exit', (code) => {
  stop();
  process.exitCode = code ?? 0;
}));
