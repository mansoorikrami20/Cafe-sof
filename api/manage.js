import {createHandler} from '../server/manage.js';
import {readStore,writeStore,connected} from '../server/storage.js';
export default createHandler({readStore,writeStore,connected});
