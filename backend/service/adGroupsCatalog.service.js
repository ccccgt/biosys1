const ldap = require("ldapjs");
const db = require("../config/db");

function createLdapClient() {
  return ldap.createClient({
    url: process.env.AD_URL,
    timeout: 15000,
    connectTimeout: 15000,
    reconnect: false,
  });
}

function bindClient(client, dn, password) {
  return new Promise((resolve, reject) => {
    client.bind(dn, password, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function unbindClient(client) {
  return new Promise((resolve) => {
    try {
      client.unbind(() => resolve());
    } catch {
      resolve();
    }
  });
}

function safeString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    if (typeof value.toString === "function") {
      const s = value.toString();
      return s && s !== "[object Object]" ? s : null;
    }
  } catch {}
  return null;
}

function pojoAttributesToMap(pojo) {
  const out = {};
  const attrs = pojo?.attributes || [];

  for (const attr of attrs) {
    const type = attr?.type;
    const vals = attr?.values || [];
    if (!type) continue;

    if (vals.length === 0) out[type] = null;
    else if (vals.length === 1) out[type] = vals[0];
    else out[type] = vals;
  }

  return out;
}

async function fetchAllAdGroups() {
  const client = createLdapClient();

  try {
    await bindClient(
      client,
      process.env.AD_BIND_DN,
      process.env.AD_BIND_PASSWORD
    );

    const baseDn = process.env.AD_BASE_DN;

    const groups = await new Promise((resolve, reject) => {
      const rows = [];

      client.search(
        baseDn,
        {
          scope: "sub",
          filter: "(&(objectClass=group)(cn=*))",
          attributes: ["cn", "distinguishedName", "description"],
          paged: true,
        },
        (err, res) => {
          if (err) return reject(err);

          res.on("searchEntry", (entry) => {
            const obj = entry.object || {};
            const pojo = entry.pojo || {};
            const attrMap = pojoAttributesToMap(pojo);

            const groupName =
              safeString(obj.cn) ||
              safeString(attrMap.cn) ||
              null;

            const groupDn =
              safeString(obj.distinguishedName) ||
              safeString(attrMap.distinguishedName) ||
              safeString(entry.objectName) ||
              safeString(entry.dn) ||
              safeString(pojo.objectName);

            const description =
              safeString(obj.description) ||
              safeString(attrMap.description) ||
              null;

            if (!groupName || !groupDn) return;

            rows.push({
              group_name: groupName,
              group_dn: groupDn,
              description,
            });
          });

          res.on("error", (e) => reject(e));
          res.on("end", () => resolve(rows));
        }
      );
    });

    return groups;
  } finally {
    await unbindClient(client);
  }
}

async function syncAdGroupsCatalog() {
  const groups = await fetchAllAdGroups();

  await db.query(`UPDATE ad_groups_catalog SET is_active = 0`);

  for (const g of groups) {
    await db.query(
      `
      INSERT INTO ad_groups_catalog (
        group_name,
        group_dn,
        description,
        is_active,
        last_sync_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, 1, NOW(), NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        group_name = VALUES(group_name),
        description = VALUES(description),
        is_active = 1,
        last_sync_at = NOW(),
        updated_at = NOW()
      `,
      [g.group_name, g.group_dn, g.description]
    );
  }

  return {
    total: groups.length,
  };
}

module.exports = {
  fetchAllAdGroups,
  syncAdGroupsCatalog,
};