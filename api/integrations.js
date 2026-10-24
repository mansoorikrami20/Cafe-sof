import {get,put} from '@vercel/blob';
import {readStore,connected} from '../server/storage.js';
import {createVaultStorage} from '../server/integration-vault.js';
import {createIntegrationsHandler} from '../server/integrations.js';
const {readVault,writeVault}=createVaultStorage({get,put});
export default createIntegrationsHandler({readStore,connected,readVault,writeVault});
