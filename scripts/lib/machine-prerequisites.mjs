// Arch's UID/GID mapping helpers come from shadow, not Debian's uidmap.
// Inspect executable availability so an already usable host is not asked to
// reinstall packages. These checks never execute host-changing commands.
import { accessSync, constants } from "node:fs";
import { delimiter, join } from "node:path";

export function inspectRootlessTools(path = process.env.PATH ?? "") {
  function available(name) {
    return path.split(delimiter).some((dir) => {
      try {
        accessSync(join(dir, name), constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
  }
  const rootlesskit = available("rootlesskit");
  const slirp4netns = available("slirp4netns");
  const newuidmap = available("newuidmap");
  const newgidmap = available("newgidmap");
  const missingPackages = [];
  if (!rootlesskit) missingPackages.push("rootlesskit");
  if (!slirp4netns) missingPackages.push("slirp4netns");
  if (!newuidmap || !newgidmap) missingPackages.push("shadow");
  return { rootlesskit, slirp4netns, newuidmap, newgidmap, missingPackages };
}

export function isDockerGroupMember(groupRecord, groups = process.getgroups?.() ?? []) {
  const gidText = String(groupRecord ?? "")
    .trim()
    .split(":")[2];
  return /^\d+$/.test(gidText ?? "") && groups.includes(Number(gidText));
}
