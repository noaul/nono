import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

/** Preserve existing friend content when upgrading the NoDesk directory names. */
export async function migrateNodeskFriends(root) {
  const oldList = path.join(root, 'src/app/bloggers/list.json');
  const newList = path.join(root, 'src/app/friends/list.json');
  try {
    await fs.access(oldList);
    await fs.mkdir(path.dirname(newList), { recursive: true });
    await fs.copyFile(oldList, newList, constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'EEXIST') throw error;
  }
  try {
    await fs.cp(path.join(root, 'public/images/blogger'), path.join(root, 'public/images/friends'), {
      recursive: true, force: false, errorOnExist: false,
    });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
