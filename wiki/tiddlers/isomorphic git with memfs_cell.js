import * as git from 'https://cdn.jsdelivr.net/npm/isomorphic-git@1.38.6/+esm';
import { Volume, createFsFromVolume } from 'https://cdn.jsdelivr.net/npm/memfs@4.64.0/+esm';

// A new volume starts empty and is discarded when this notebook is re-run.
const volume = new Volume();
const fs = createFsFromVolume(volume);
const repo = {fs, dir: '/hello-git'};
const pfs = fs.promises;
const notebookFilesDir = `${repo.dir}/notebook-files`;
await pfs.mkdir(repo.dir, {recursive: true});
const initialized = await git.init({...repo, defaultBranch: 'main', noOverwrite: true});