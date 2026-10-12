const ldap = require("ldapjs");
const bcrypt = require("bcryptjs");
const db = require("../config/db");

/* =======================================================
   LDAP helpers
======================================================= */

function createLdapClient() {
  console.log("[AD] createLdapClient ->", process.env.AD_URL);

  return ldap.createClient({
    url: process.env.AD_URL,
    timeout: 8000,
    connectTimeout: 8000,
    reconnect: false,
  });
}

function bindClient(client, dn, password) {
  return new Promise((resolve, reject) => {
    console.log("[AD] bindClient -> intentando bind con DN:", dn);

    client.bind(dn, password, (err) => {
      if (err) {
        console.log("[AD] bindClient -> ERROR bind con DN:", dn);
        console.log("[AD] bindClient -> detalle:", err.message || err);
        return reject(err);
      }

      console.log("[AD] bindClient -> OK bind con DN:", dn);
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

function escapeLdapFilter(value) {
  return String(value)
    .replace(/\\/g, "\\5c")
    .replace(/\*/g, "\\2a")
    .replace(/\(/g, "\\28")
    .replace(/\)/g, "\\29")
    .replace(/\0/g, "\\00");
}

function safeString(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    const s = value.trim();
    return s || null;
  }

  try {
    if (typeof value.toString === "function") {
      const s = String(value.toString()).trim();
      if (!s || s === "[object Object]") return null;
      return s;
    }
  } catch (_) {}

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

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
}

function normalizeGroupName(groupDnOrName) {
  if (!groupDnOrName) return null;
  const s = String(groupDnOrName).trim();
  const m = s.match(/^CN=([^,]+)/i);
  return m ? m[1].trim() : s;
}

function resolveEmail({ email, adUpn, username }) {
  const mail = safeString(email);
  if (mail) return mail;

  const upn = safeString(adUpn);
  if (upn && upn.includes("@")) return upn;

  const adDomain = safeString(process.env.AD_DOMAIN);
  if (adDomain) return `${username}@${adDomain}`;

  return `${username}@local.biosys`;
}

function buildPlaceholderPasswordHash(username) {
  const seed = `AD_ONLY_LOGIN::${username}::BIOSYS`;
  return bcrypt.hashSync(seed, 10);
}

/* =======================================================
   LDAP search
======================================================= */

async function searchOneUser(client, baseDn, filter, loginFallback) {
  console.log("[AD] searchOneUser -> baseDn:", baseDn);
  console.log("[AD] searchOneUser -> filter:", filter);

  return new Promise((resolve, reject) => {
    let result = null;

    client.search(
      baseDn,
      {
        scope: "sub",
        sizeLimit: 1,
        filter,
        attributes: [
          "distinguishedName",
          "cn",
          "displayName",
          "givenName",
          "sn",
          "mail",
          "userPrincipalName",
          "sAMAccountName",
          "department",
          "title",
          "telephoneNumber",
          "l",
          "memberOf",
        ],
      },
      (err, res) => {
        if (err) {
          console.log("[AD] searchOneUser -> ERROR al iniciar search:", err.message || err);
          return reject(err);
        }

        res.on("searchEntry", (entry) => {
          const obj = entry.object || {};
          const pojo = entry.pojo || {};
          const attrMap = pojoAttributesToMap(pojo);

          const dn =
            safeString(obj.distinguishedName) ||
            safeString(attrMap.distinguishedName) ||
            safeString(entry.objectName) ||
            safeString(pojo.objectName);

          const username =
            safeString(obj.sAMAccountName) ||
            safeString(attrMap.sAMAccountName) ||
            loginFallback;

          const adUpn =
            safeString(obj.userPrincipalName) ||
            safeString(attrMap.userPrincipalName) ||
            null;

          const email =
            safeString(obj.mail) ||
            safeString(attrMap.mail) ||
            null;

          const memberOf = obj.memberOf ?? attrMap.memberOf ?? null;

          result = {
            dn,
            username,
            email,
            displayName:
              safeString(obj.displayName) ||
              safeString(attrMap.displayName) ||
              safeString(obj.cn) ||
              safeString(attrMap.cn) ||
              username,
            firstName:
              safeString(obj.givenName) ||
              safeString(attrMap.givenName) ||
              null,
            lastName:
              safeString(obj.sn) ||
              safeString(attrMap.sn) ||
              null,
            adUpn,
            department:
              safeString(obj.department) ||
              safeString(attrMap.department) ||
              null,
            position:
              safeString(obj.title) ||
              safeString(attrMap.title) ||
              null,
            phone:
              safeString(obj.telephoneNumber) ||
              safeString(attrMap.telephoneNumber) ||
              null,
            city:
              safeString(obj.l) ||
              safeString(attrMap.l) ||
              null,
            groupsRaw: toArray(memberOf),
          };

          console.log("[AD] searchOneUser -> usuario encontrado:");
          console.log({
            dn: result.dn,
            username: result.username,
            adUpn: result.adUpn,
            email: result.email,
            displayName: result.displayName,
            groupsCount: result.groupsRaw.length,
          });
        });

        res.on("error", (searchErr) => {
          console.log("[AD] searchOneUser -> ERROR evento search:", searchErr.message || searchErr);
          reject(searchErr);
        });

        res.on("end", (info) => {
          console.log("[AD] searchOneUser -> END search, status:", info?.status);

          if (!result) {
            console.log("[AD] searchOneUser -> sin resultados para filter:", filter);
          }

          resolve(result);
        });
      }
    );
  });
}

async function findAdUser(loginInput) {
  const login = String(loginInput || "").trim();
  const escaped = escapeLdapFilter(login);

  console.log("==================================================");
  console.log("[AD] findAdUser -> login recibido:", login);

  const client = createLdapClient();

  try {
    console.log("[AD] findAdUser -> intentando bind de servicio");
    await bindClient(client, process.env.AD_BIND_DN, process.env.AD_BIND_PASSWORD);
    console.log("[AD] findAdUser -> bind de servicio OK");

    const baseDn = process.env.AD_BASE_DN;

    const filters = [
      `(sAMAccountName=${escaped})`,
      `(userPrincipalName=${escaped})`,
      `(mail=${escaped})`,
    ];

    let found = null;

    for (const filter of filters) {
      console.log("[AD] findAdUser -> probando filtro:", filter);
      found = await searchOneUser(client, baseDn, filter, login);

      if (found?.dn) {
        console.log("[AD] findAdUser -> encontrado con filtro:", filter);
        break;
      }
    }

    if (!found?.dn) {
      console.log("[AD] findAdUser -> NO encontrado en AD:", login);
      console.log("==================================================");
      return null;
    }

    const email = resolveEmail({
      email: found.email,
      adUpn: found.adUpn,
      username: found.username,
    });

    const finalUser = {
      ...found,
      email,
      groupsRaw: found.groupsRaw || [],
      groups: (found.groupsRaw || []).map(normalizeGroupName).filter(Boolean),
    };

    console.log("[AD] findAdUser -> resultado final:");
    console.log({
      dn: finalUser.dn,
      username: finalUser.username,
      email: finalUser.email,
      adUpn: finalUser.adUpn,
      displayName: finalUser.displayName,
      groups: finalUser.groups,
    });
    console.log("==================================================");

    return finalUser;
  } catch (error) {
    console.log("[AD] findAdUser -> ERROR general:", error.message || error);
    console.log("==================================================");
    throw error;
  } finally {
    await unbindClient(client);
  }
}

async function verifyAdPassword(userDn, password) {
  const dn = safeString(userDn);
  if (!dn) {
    console.log("[AD] verifyAdPassword -> DN inválido/vacío");
    return false;
  }

  console.log("[AD] verifyAdPassword -> probando credenciales para DN:", dn);

  const client = createLdapClient();

  try {
    await bindClient(client, dn, password);
    console.log("[AD] verifyAdPassword -> contraseña válida para DN:", dn);
    return true;
  } catch (error) {
    console.log("[AD] verifyAdPassword -> contraseña inválida o bind falló para DN:", dn);
    console.log("[AD] verifyAdPassword -> detalle:", error.message || error);
    return false;
  } finally {
    await unbindClient(client);
  }
}

/* =======================================================
   Roles and permissions
======================================================= */

async function resolveRoleAndPermissionsFromGroups(groupNames) {
  const normalizedGroups = Array.isArray(groupNames)
    ? groupNames.filter(Boolean)
    : [];

  console.log("[AD] resolveRoleAndPermissionsFromGroups -> groups:", normalizedGroups);

  const [viewerRows] = await db.query(
    `SELECT id, name FROM roles WHERE name = 'viewer' LIMIT 1`
  );
  const viewerRole = viewerRows?.[0] || null;

  const defaultResolved = {
    role_id: viewerRole?.id || null,
    role_name: viewerRole?.name || "viewer",
    permissions: {
      menu_users_enabled: 0,
      dashboard_enabled: 1,
      reports_enabled: 1,
      biometric_users_enabled: 1,
    },
  };

  if (!normalizedGroups.length) {
    console.log("[AD] resolveRoleAndPermissionsFromGroups -> sin grupos, default viewer");
    return defaultResolved;
  }

  const placeholders = normalizedGroups.map(() => "?").join(",");

  const [rows] = await db.query(
    `
    SELECT
      m.*,
      r.name AS role_name
    FROM ad_group_role_map m
    INNER JOIN roles r ON r.id = m.role_id
    WHERE m.ad_group_name IN (${placeholders})
    ORDER BY
      CASE r.name
        WHEN 'admin' THEN 1
        WHEN 'manager' THEN 2
        WHEN 'viewer' THEN 3
        ELSE 99
      END ASC,
      m.id ASC
    LIMIT 1
    `,
    normalizedGroups
  );

  if (!rows.length) {
    console.log("[AD] resolveRoleAndPermissionsFromGroups -> sin mapeo, default viewer");
    return defaultResolved;
  }

  const row = rows[0];

  const resolved = {
    role_id: row.role_id,
    role_name: row.role_name || "viewer",
    permissions: {
      menu_users_enabled: Number(row.menu_users_enabled || 0),
      dashboard_enabled: Number(row.dashboard_enabled || 0),
      reports_enabled: Number(row.reports_enabled || 0),
      biometric_users_enabled: Number(row.biometric_users_enabled || 0),
    },
  };

  console.log("[AD] resolveRoleAndPermissionsFromGroups -> resolved:", resolved);

  return resolved;
}

/* =======================================================
   Local user sync
======================================================= */

async function upsertLocalUserFromAd(adUser, resolvedRole) {
  const finalEmail = resolveEmail({
    email: adUser.email,
    adUpn: adUser.adUpn,
    username: adUser.username,
  });

  console.log("[AD] upsertLocalUserFromAd -> username:", adUser.username);
  console.log("[AD] upsertLocalUserFromAd -> finalEmail:", finalEmail);
  console.log("[AD] upsertLocalUserFromAd -> resolvedRole:", resolvedRole);

  const [existingRows] = await db.query(
    `
    SELECT *
    FROM users
    WHERE name = ?
       OR email = ?
       OR ad_upn = ?
    LIMIT 1
    `,
    [adUser.username, finalEmail, adUser.adUpn]
  );

  if (!existingRows.length) {
    console.log("[AD] upsertLocalUserFromAd -> usuario NO existe, insertando");

    const placeholderPasswordHash = buildPlaceholderPasswordHash(adUser.username);

    const [insertResult] = await db.query(
      `
      INSERT INTO users (
        name,
        email,
        password,
        display_name,
        first_name,
        last_name,
        department,
        position,
        phone,
        city,
        auth_source,
        ad_dn,
        ad_upn,
        role_id,
        is_active,
        last_login_at,
        last_sync_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ad', ?, ?, ?, 1, NOW(), NOW(), NOW(), NOW())
      `,
      [
        adUser.username,
        finalEmail,
        placeholderPasswordHash,
        adUser.displayName,
        adUser.firstName,
        adUser.lastName,
        adUser.department,
        adUser.position,
        adUser.phone,
        adUser.city,
        adUser.dn,
        adUser.adUpn,
        resolvedRole.role_id,
      ]
    );

    console.log("[AD] upsertLocalUserFromAd -> insertId:", insertResult.insertId);
    return insertResult.insertId;
  }

  const user = existingRows[0];
  console.log("[AD] upsertLocalUserFromAd -> usuario existente id:", user.id);

  await db.query(
    `
    UPDATE users
    SET
      name = ?,
      email = ?,
      display_name = ?,
      first_name = ?,
      last_name = ?,
      department = ?,
      position = ?,
      phone = ?,
      city = ?,
      auth_source = 'ad',
      ad_dn = ?,
      ad_upn = ?,
      role_id = ?,
      is_active = 1,
      last_login_at = NOW(),
      last_sync_at = NOW(),
      updated_at = NOW()
    WHERE id = ?
    `,
    [
      adUser.username,
      finalEmail,
      adUser.displayName,
      adUser.firstName,
      adUser.lastName,
      adUser.department,
      adUser.position,
      adUser.phone,
      adUser.city,
      adUser.dn,
      adUser.adUpn,
      resolvedRole.role_id,
      user.id,
    ]
  );

  console.log("[AD] upsertLocalUserFromAd -> usuario actualizado id:", user.id);
  return user.id;
}

async function syncUserGroups(userId, groupsRaw) {
  console.log("[AD] syncUserGroups -> userId:", userId, "groupsRaw:", groupsRaw);

  await db.query(`DELETE FROM user_ad_groups WHERE user_id = ?`, [userId]);

  const rows = (groupsRaw || [])
    .map((gdn) => {
      const groupName = normalizeGroupName(gdn);
      if (!groupName) return null;
      return [userId, groupName, gdn];
    })
    .filter(Boolean);

  for (const row of rows) {
    await db.query(
      `
      INSERT INTO user_ad_groups (
        user_id,
        group_name,
        group_dn,
        source,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, 'ad', NOW(), NOW())
      `,
      row
    );
  }

  console.log("[AD] syncUserGroups -> total grupos sincronizados:", rows.length);
}

async function getLocalUserWithRoleAndPermissions(userId) {
  const [rows] = await db.query(
    `
    SELECT
      u.id,
      u.name,
      u.email,
      u.display_name,
      u.first_name,
      u.last_name,
      u.employee_code,
      u.card_id,
      u.department,
      u.position,
      u.phone,
      u.city,
      u.birth_date,
      u.organization,
      u.job_title,
      u.bio,
      u.profile_photo_url,
      u.auth_source,
      u.ad_dn,
      u.ad_upn,
      u.role_id,
      u.is_active,
      u.last_login_at,
      r.name AS role_name,
      up.menu_users_enabled AS up_menu_users_enabled,
      up.dashboard_enabled AS up_dashboard_enabled,
      up.reports_enabled AS up_reports_enabled,
      up.biometric_users_enabled AS up_biometric_users_enabled
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    LEFT JOIN user_permissions up ON up.user_id = u.id
    WHERE u.id = ?
    LIMIT 1
    `,
    [userId]
  );

  if (!rows.length) {
    console.log("[AD] getLocalUserWithRoleAndPermissions -> no se encontró userId:", userId);
    return null;
  }

  const user = rows[0];

  const permissions = {
    menu_users_enabled:
      user.up_menu_users_enabled !== null && user.up_menu_users_enabled !== undefined
        ? Number(user.up_menu_users_enabled)
        : Number(user.role_name === "admin"),
    dashboard_enabled:
      user.up_dashboard_enabled !== null && user.up_dashboard_enabled !== undefined
        ? Number(user.up_dashboard_enabled)
        : 1,
    reports_enabled:
      user.up_reports_enabled !== null && user.up_reports_enabled !== undefined
        ? Number(user.up_reports_enabled)
        : 1,
    biometric_users_enabled:
      user.up_biometric_users_enabled !== null && user.up_biometric_users_enabled !== undefined
        ? Number(user.up_biometric_users_enabled)
        : 1,
  };

  const [groupRows] = await db.query(
    `
    SELECT group_name, group_dn
    FROM user_ad_groups
    WHERE user_id = ?
    ORDER BY group_name ASC
    `,
    [userId]
  );

  const finalUser = {
    id: user.id,
    username: user.name,
    email: user.email,
    display_name: user.display_name,
    first_name: user.first_name,
    last_name: user.last_name,
    employee_code: user.employee_code,
    card_id: user.card_id,
    department: user.department,
    position: user.position,
    phone: user.phone,
    city: user.city,
    birth_date: user.birth_date,
    organization: user.organization,
    job_title: user.job_title,
    bio: user.bio,
    profile_photo_url: user.profile_photo_url,
    auth_source: user.auth_source,
    ad_dn: user.ad_dn,
    ad_upn: user.ad_upn,
    role_id: user.role_id,
    role: user.role_name || "viewer",
    is_active: Number(user.is_active || 0),
    last_login_at: user.last_login_at,
    permissions,
    ad_groups: groupRows || [],
  };

  console.log("[AD] getLocalUserWithRoleAndPermissions -> finalUser:");
  console.log({
    id: finalUser.id,
    username: finalUser.username,
    role: finalUser.role,
    role_id: finalUser.role_id,
    permissions: finalUser.permissions,
  });

  return finalUser;
}

async function resyncUserFromAdByUsername(username) {
  console.log("[AD] resyncUserFromAdByUsername ->", username);

  const adUser = await findAdUser(username);
  if (!adUser) {
    throw new Error("Usuario no encontrado en Active Directory");
  }

  const resolvedRole = await resolveRoleAndPermissionsFromGroups(adUser.groups || []);
  const localUserId = await upsertLocalUserFromAd(adUser, resolvedRole);
  await syncUserGroups(localUserId, adUser.groupsRaw || []);
  const localUser = await getLocalUserWithRoleAndPermissions(localUserId);

  return {
    localUserId,
    adUser,
    resolvedRole,
    localUser,
  };
}

module.exports = {
  findAdUser,
  verifyAdPassword,
  resolveRoleAndPermissionsFromGroups,
  upsertLocalUserFromAd,
  syncUserGroups,
  getLocalUserWithRoleAndPermissions,
  resyncUserFromAdByUsername,
};