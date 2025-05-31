import { Config } from '@algorandfoundation/algokit-utils';
import { registerDebugEventHandlers } from '@algorandfoundation/algokit-utils-debug';
import { consoleLogger } from '@algorandfoundation/algokit-utils/types/logging';
import { promises as fs } from 'fs';
import * as path from 'path';

// Configure AlgoKit with enhanced logging and debugging
Config.configure({
  logger: consoleLogger,
  debug: true,
});

registerDebugEventHandlers();

// Base directory for deployers
const baseDir = path.resolve(__dirname);

// Dynamically import deploy-config module if it exists
async function importDeployerIfExists(dir: string) {
  const deployerPath = path.resolve(dir, 'deploy-config');
  try {
    if (await fs.stat(deployerPath + '.ts').catch(() => null) || await fs.stat(deployerPath + '.js').catch(() => null)) {
      const deployer = await import(deployerPath);
      return { ...deployer, name: path.basename(dir) };
    }
  } catch (error) {
    console.error(`Error importing deploy-config from ${dir}:`, error);
  }
  return null;
}

// Retrieve all deployers from subdirectories
async function getDeployers() {
  try {
    const directories = await fs.readdir(baseDir, { withFileTypes: true });
    const deployers = await Promise.all(
      directories
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => importDeployerIfExists(path.resolve(baseDir, dirent.name)))
    );
    return deployers.filter((deployer) => deployer !== null);
  } catch (error) {
    console.error('Error reading directories:', error);
    return [];
  }
}

// Execute deployers for specified contract or all
(async () => {
  const contractName = process.argv[2];
  const contractDeployers = await getDeployers();
  const deployersToExecute = contractName
    ? contractDeployers.filter((deployer) => deployer.name === contractName)
    : contractDeployers;

  if (contractName && deployersToExecute.length === 0) {
    console.warn(`No deployer found for contract name: ${contractName}`);
    return;
  }

  for (const deployer of deployersToExecute) {
    try {
      await deployer.deploy();
    } catch (error) {
      console.error(`Error deploying ${deployer.name}:`, error);
    }
  }
})();
