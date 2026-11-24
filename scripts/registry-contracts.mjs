import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {checkContract} from '../worker/registry/contract.js';

export const upstream = 'e0295ebcd485b100150773e6f9c2e9497a5bbd45';
const pins = {
  'common.schema.json': 'eedd0d0bc5fe40e5b54e73f3a7bd5e3e5e1b85b92c03e6c50eece2c52b67de01',
  'reviewed-protocol.schema.json': '903b3fce4f260cf112e347ba6f0e6552020f5ad46577ff81376aa1a60de42c9c',
  'versions/manifest.json': '4f7eca00be41582778c6cdd01e2704a9250f6748d046a54ad366558fb7a6227e',
  'versions/0.1.0/equipment-registry.schema.json': '6030cdc68e748382873c04eaacd3fe934ead95f9789293ca54aafdeeac1ce2ac',
  'versions/0.1.0/instrument-model.schema.json': '4dca9c5f7f3c6c4bd8eead121695ab8ce03e7d5d076700f6768cb50cb2106ca5',
  'versions/0.1.0/typed-measurement.schema.json': '9f43b279e11921b5d52bd0beecc12119fc9c2ecca2a8ab90dfc726be95cd1fce',
};
export async function registryContracts() {
  const prefix = 'https://github.com/neurogenomics/agentic-lab/contracts/';
  const schemas = {};
  let root;
  for (const [name, sha256] of Object.entries(pins)) {
    const bytes = await readFile(new URL('../worker/registry/contracts/' + name, import.meta.url));
    if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw Error('Registry contract checksum failed: ' + name);
    const value = JSON.parse(bytes);
    if (name === 'versions/manifest.json') {
      if (value['equipment-registry']['0.1.0'] !== 'versions/0.1.0/equipment-registry.schema.json') throw Error('Registry release mismatch');
      root = prefix + value['equipment-registry']['0.1.0'];
    } else {
      if (value.$id !== prefix + name) throw Error('Unexpected registry contract ID: ' + name);
      schemas[value.$id] = value;
    }
  }
  const bundle = {root, schemas, upstream};
  checkContract(bundle);
  return bundle;
}
