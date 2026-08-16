import { Volume, createFsFromVolume } from 'https://cdn.jsdelivr.net/npm/memfs@4.64.0/+esm';

const volume = new Volume();
const fs = createFsFromVolume(volume);
const pfs = fs.promises;
const watchDir = '/watched';

await pfs.mkdir(watchDir, {recursive: true});
display({watchDir, files: await pfs.readdir(watchDir)});