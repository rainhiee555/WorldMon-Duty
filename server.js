import "dotenv/config";

import express from "express";
import cookieParser from "cookie-parser";
import crypto from "node:crypto";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";

import {
  readJson,
  writeJson,
  updateJson
} from "./storage.js";

import {
  getDiscordLoginURL,
  exchangeCode,
  getDiscordUser,
  getGuildMember,
  getAvatarURL,
  sendDiscordLog,
  sendLeaveDiscordLog
} from "./discord.js";
import {
  initDatabase
} from "./database.js";

const app = express();
const AVATAR_DIR =
  path.resolve(
    "public",
    "uploads",
    "avatars"
  );

fs.mkdirSync(
  AVATAR_DIR,
  {
    recursive: true
  }
);

const avatarStorage =
  multer.diskStorage({

    destination(
      request,
      file,
      callback
    ) {

      callback(
        null,
        AVATAR_DIR
      );

    },

    filename(
      request,
      file,
      callback
    ) {

      const extensions = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp"
      };

      const extension =
        extensions[file.mimetype];

      if (!extension) {

        return callback(
          new Error(
            "INVALID_IMAGE_TYPE"
          )
        );

      }

      callback(
        null,
        `${request.user.discordId}-${crypto.randomUUID()}${extension}`
      );

    }

  });


const uploadAvatar =
  multer({

    storage:
      avatarStorage,

    limits: {
      fileSize:
        5 *
        1024 *
        1024
    },

    fileFilter(
      request,
      file,
      callback
    ) {

      const allowed = [
        "image/jpeg",
        "image/png",
        "image/webp"
      ];

      if (
        !allowed.includes(
          file.mimetype
        )
      ) {

        return callback(
          new Error(
            "INVALID_IMAGE_TYPE"
          )
        );

      }

      callback(
        null,
        true
      );

    }

  });
const PORT =
  Number(process.env.PORT || 3000);

const BASE_URL =
  process.env.BASE_URL ||
  `http://localhost:${PORT}`;

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "CHANGE-ME";

app.use(express.json({
  limit: "1mb"
}));

app.use(cookieParser());

app.use(
  express.static("public")
);

function now() {
  return new Date().toISOString();
}

function createId() {
  return crypto.randomUUID();
}

// =========================
// SESSION
// =========================

function sign(value) {
  return crypto
    .createHmac(
      "sha256",
      SESSION_SECRET
    )
    .update(value)
    .digest("base64url");
}

function createSession(
  response,
  user
) {
  const body = Buffer
    .from(
      JSON.stringify({
        discordId:
          user.discordId
      })
    )
    .toString("base64url");

  const signature =
    sign(body);

  response.cookie(
    "duty_session",
    `${body}.${signature}`,
    {
      httpOnly: true,
      sameSite: "lax",

      secure:
        BASE_URL.startsWith(
          "https://"
        ),

      maxAge:
        7 *
        24 *
        60 *
        60 *
        1000
    }
  );
}

function getSession(request) {
  const cookie =
    request.cookies.duty_session;

  if (!cookie) {
    return null;
  }

  const [
    body,
    signature
  ] = cookie.split(".");

  if (
    !body ||
    !signature
  ) {
    return null;
  }

  const expected =
    sign(body);

  try {
    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      )
    ) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    return JSON.parse(
      Buffer
        .from(
          body,
          "base64url"
        )
        .toString()
    );
  } catch {
    return null;
  }
}

// =========================
// SETTINGS
// =========================

async function getSettings() {
  return readJson(
    "settings.json",
    {
      organizationName:
        "ระบบเข้าเวร",

      normalHours: 8,

      forceClockOutHours:
        16,

      autoClockOut: true,

      allowOvertime: true,

      timezone:
        "Asia/Bangkok",

      maintenanceMode:
        false
    }
  );
}

// =========================
// TIME CALCULATION
// =========================

function calculateTime(
  start,
  end,
  normalHours,
  allowOvertime = true
) {

  const totalMs =
    Math.max(
      0,
      new Date(end) -
      new Date(start)
    );

  const normalLimit =
    Number(normalHours) *
    60 *
    60 *
    1000;

  const normalMs =
    Math.min(
      totalMs,
      normalLimit
    );

  const overtimeMs =
    allowOvertime
      ? Math.max(
          0,
          totalMs -
          normalLimit
        )
      : 0;

  return {
    totalMs,
    normalMs,
    overtimeMs
  };
}

function formatDuration(ms) {
  const minutes =
    Math.floor(
      ms / 60000
    );

  const hours =
    Math.floor(
      minutes / 60
    );

  const remain =
    minutes % 60;

  return (
    `${hours} ชม. ` +
    `${remain} นาที`
  );
}function getUserLevel(user) {

  return user?.isAdmin
    ? "Head Admin"
    : "Admin";

}


function getProfileAvatar(user) {

  return (
    user?.customAvatar ||
    user?.avatar ||
    null
  );

}


function normalizeUser(user) {

  return {
    ...user,

    displayName:
      user.displayName ||
      user.username,

    customAvatar:
      user.customAvatar ||
      null,

    level:
      getUserLevel(user),

    profileAvatar:
      getProfileAvatar(user)
  };

}


function deleteLocalAvatar(
  avatarPath
) {

  if (
    !avatarPath ||
    !avatarPath.startsWith(
      "/uploads/avatars/"
    )
  ) {

    return;

  }

  const fileName =
    path.basename(
      avatarPath
    );

  const fullPath =
    path.join(
      AVATAR_DIR,
      fileName
    );

  try {

    if (
      fs.existsSync(
        fullPath
      )
    ) {

      fs.unlinkSync(
        fullPath
      );

    }

  } catch (error) {

    console.error(
      "Cannot delete avatar:",
      error
    );

  }

}


function safeDate(value) {

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {

    return null;

  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return null;

  }

  return date;

}


function hoursFromMs(ms) {

  return Number(
    (
      Math.max(0, ms) /
      3600000
    ).toFixed(2)
  );

}

// =========================
// AUDIT
// =========================

async function audit(
  actor,
  action,
  target = null,
  detail = {}
) {
  await updateJson(
    "audit.json",
    [],
    logs => {
      logs.unshift({
        id: createId(),
        at: now(),
        actor,
        action,
        target,
        detail
      });

      if (
        logs.length > 5000
      ) {
        logs.length = 5000;
      }
    }
  );
}

// =========================
// AUTH MIDDLEWARE
// =========================

async function getCurrentUser(
  request
) {
  const session =
    getSession(request);

  if (!session) {
    return null;
  }

  const users =
    await readJson(
      "users.json",
      []
    );

  return (
    users.find(
      user =>
        user.discordId ===
          session.discordId &&
        user.enabled !== false
    ) || null
  );
}

async function requireUser(
  request,
  response,
  next
) {
  const user =
    await getCurrentUser(
      request
    );

  if (!user) {
    return response
      .status(401)
      .json({
        error:
          "UNAUTHORIZED"
      });
  }

  request.user = user;

  next();
}

function requireAdmin(
  request,
  response,
  next
) {
  if (
    !request.user?.isAdmin
  ) {
    return response
      .status(403)
      .json({
        error:
          "ADMIN_ONLY"
      });
  }

  next();
}

// =========================
// DISCORD LOGIN
// =========================

app.get(
  "/auth/discord",
  (request, response) => {
    const state =
      crypto
        .randomBytes(24)
        .toString("hex");

    response.cookie(
      "oauth_state",
      state,
      {
        httpOnly: true,
        sameSite: "lax",

        secure:
          BASE_URL.startsWith(
            "https://"
          ),

        maxAge:
          10 *
          60 *
          1000
      }
    );

    response.redirect(
      getDiscordLoginURL(
        state
      )
    );
  }
);

app.get(
  "/auth/discord/callback",

  async (
    request,
    response
  ) => {
    try {
      if (
        !request.query.code ||
        !request.query.state ||
        request.query.state !==
          request.cookies
            .oauth_state
      ) {
        return response
          .status(400)
          .send(
            "Invalid OAuth state"
          );
      }

      const token =
        await exchangeCode(
          String(
            request.query.code
          )
        );

      const discordUser =
        await getDiscordUser(
          token.access_token
        );

      let member = {};

      if (
        process.env
          .DISCORD_GUILD_ID
      ) {
        member =
          await getGuildMember(
            token.access_token,
            process.env
              .DISCORD_GUILD_ID
          );

        if (!member) {
          return response
            .status(403)
            .send(
              "คุณไม่ได้อยู่ใน Discord Server ที่กำหนด"
            );
        }
      }

      let localUser;

      await updateJson(
        "users.json",
        [],
        users => {
          localUser =
            users.find(
              user =>
                user.discordId ===
                discordUser.id
            );

          const roleAdmin =
            Boolean(
              process.env
                .DISCORD_ADMIN_ROLE_ID &&
              member?.roles?.includes(
                process.env
                  .DISCORD_ADMIN_ROLE_ID
              )
            );

          if (!localUser) {
            localUser = {

  discordId:
    discordUser.id,

  username:
    discordUser.global_name ||
    discordUser.username,

  displayName:
    discordUser.global_name ||
    discordUser.username,

  discordUsername:
    discordUser.username,

  avatar:
    getAvatarURL(
      discordUser
    ),

  customAvatar:
    null,

  enabled:
    true,

  isAdmin:
    roleAdmin,

  createdAt:
    now(),

  lastLoginAt:
    now()

};

            users.push(
              localUser
            );
          } else {
            localUser.username =
              discordUser.global_name ||
              discordUser.username;

            localUser.avatar =
              getAvatarURL(
                discordUser
              );
            localUser.discordUsername =
  discordUser.username;

if (!localUser.displayName) {

  localUser.displayName =
    localUser.username;

}

if (
  localUser.customAvatar ===
  undefined
) {

  localUser.customAvatar =
    null;

}

            localUser.lastLoginAt =
              now();

            // if (roleAdmin) {
            //   localUser.isAdmin =
            //     true;
            // }
          }
        }
      );

      if (
        localUser.enabled ===
        false
      ) {
        return response
          .status(403)
          .send(
            "บัญชีถูกระงับ"
          );
      }

      createSession(
        response,
        localUser
      );

      response.clearCookie(
        "oauth_state"
      );

      response.redirect("/");
    } catch (error) {
      console.error(error);

      response
        .status(500)
        .send(
          "Discord Login Failed"
        );
    }
  }
);

// =========================
// LOGOUT
// =========================

app.post(
  "/api/logout",
  (
    request,
    response
  ) => {
    response.clearCookie(
      "duty_session"
    );

    response.json({
      ok: true
    });
  }
);

// =========================
// ME
// =========================

app.get(
  "/api/me",

  async (
    request,
    response
  ) => {
    const user =
      await getCurrentUser(
        request
      );

    const settings =
      await getSettings();

    if (!user) {
      return response.json({
        authenticated:
          false,

        settings
      });
    }

    const shifts =
      await readJson(
        "shifts.json",
        []
      );

    const activeShift =
      shifts.find(
        shift =>
          shift.discordId ===
            user.discordId &&
          !shift.endAt
      );

    response.json({
  authenticated:
    true,

  user:
    normalizeUser(user),

  activeShift:
    activeShift || null,

  settings
});
  }
);
// =========================
// PROFILE
// =========================

app.get(
  "/api/profile",
  requireUser,

  async (
    request,
    response
  ) => {

    const shifts =
      await readJson(
        "shifts.json",
        []
      );

    const settings =
      await getSettings();

    let shiftCount = 0;
    let totalMs = 0;
    let normalMs = 0;
    let overtimeMs = 0;

    for (
      const shift of shifts
    ) {

      if (
        shift.discordId !==
        request.user.discordId
      ) {

        continue;

      }

      if (!shift.endAt) {
        continue;
      }

      const time =
        calculateTime(
          shift.startAt,
          shift.endAt,
          settings.normalHours
        );

      shiftCount++;

      totalMs +=
        time.totalMs;

      normalMs +=
        time.normalMs;

      overtimeMs +=
        time.overtimeMs;

    }

    response.json({

      user:
        normalizeUser(
          request.user
        ),

      stats: {

        shifts:
          shiftCount,

        totalHours:
          hoursFromMs(
            totalMs
          ),

        normalHours:
          hoursFromMs(
            normalMs
          ),

        overtimeHours:
          hoursFromMs(
            overtimeMs
          )

      }

    });

  }
);
app.post(
  "/api/profile/avatar",
  requireUser,

  (
    request,
    response,
    next
  ) => {

    uploadAvatar.single(
      "avatar"
    )(
      request,
      response,
      error => {

        if (!error) {

          return next();

        }

        if (
          error.code ===
          "LIMIT_FILE_SIZE"
        ) {

          return response
            .status(413)
            .json({
              error:
                "AVATAR_TOO_LARGE"
            });

        }

        return response
          .status(400)
          .json({
            error:
              error.message ||
              "UPLOAD_FAILED"
          });

      }
    );

  },

  async (
    request,
    response
  ) => {

    if (!request.file) {

      return response
        .status(400)
        .json({
          error:
            "NO_FILE"
        });

    }

    const newAvatar =
      `/uploads/avatars/${request.file.filename}`;

    let oldAvatar = null;
    let updated;

    await updateJson(
      "users.json",
      [],
      users => {

        const user =
          users.find(
            item =>
              item.discordId ===
              request.user.discordId
          );

        if (!user) {
          return;
        }

        oldAvatar =
          user.customAvatar ||
          null;

        user.customAvatar =
          newAvatar;

        updated =
          structuredClone(
            user
          );

      }
    );

    if (!updated) {

      deleteLocalAvatar(
        newAvatar
      );

      return response
        .status(404)
        .json({
          error:
            "USER_NOT_FOUND"
        });

    }

    if (oldAvatar) {

      deleteLocalAvatar(
        oldAvatar
      );

    }

    await audit(
      request.user.discordId,
      "AVATAR_UPDATE",
      request.user.discordId
    );

    response.json({
      ok: true,

      user:
        normalizeUser(
          updated
        )
    });

  }
);


app.delete(
  "/api/profile/avatar",
  requireUser,

  async (
    request,
    response
  ) => {

    let oldAvatar = null;

    await updateJson(
      "users.json",
      [],
      users => {

        const user =
          users.find(
            item =>
              item.discordId ===
              request.user.discordId
          );

        if (!user) {
          return;
        }

        oldAvatar =
          user.customAvatar ||
          null;

        user.customAvatar =
          null;

      }
    );

    if (oldAvatar) {

      deleteLocalAvatar(
        oldAvatar
      );

    }

    await audit(
      request.user.discordId,
      "AVATAR_RESET",
      request.user.discordId
    );

    response.json({
      ok: true
    });

  }
);

app.patch(
  "/api/profile",
  requireUser,

  async (
    request,
    response
  ) => {

    const displayName =
      String(
        request.body?.displayName || ""
      )
        .trim()
        .slice(0, 50);


    if (!displayName) {

      return response
        .status(400)
        .json({
          error:
            "กรุณากรอกชื่อแสดงผล"
        });

    }


    /*
      เปลี่ยนชื่อด้วยตัวเองได้ 1 ครั้ง

      undefined / false = ยังไม่เคยใช้สิทธิ์
      true = ใช้สิทธิ์แล้ว
    */

    if (
      request.user
        .displayNameChanged === true
    ) {

      return response
        .status(403)
        .json({
          error:
            "คุณใช้สิทธิ์เปลี่ยนชื่อแล้ว กรุณาติดต่อ Head Admin"
        });

    }


    let updated;


    await updateJson(
      "users.json",
      [],
      users => {

        const user =
          users.find(
            item =>
              item.discordId ===
              request.user.discordId
          );


        if (!user) {
          return;
        }


        user.displayName =
          displayName;

        user.displayNameChanged =
          true;

        user.displayNameChangedAt =
          now();


        updated =
          structuredClone(user);

      }
    );


    if (!updated) {

      return response
        .status(404)
        .json({
          error:
            "USER_NOT_FOUND"
        });

    }


    await audit(
      request.user.discordId,
      "PROFILE_NAME_CHANGE",
      request.user.discordId,
      {
        displayName
      }
    );


    response.json({
      ok: true,

      user:
        normalizeUser(updated)
    });

  }
);
// =========================
// START SHIFT
// =========================

app.post(
  "/api/shifts/start",
  requireUser,

  async (
    request,
    response
  ) => {
    const settings =
      await getSettings();

    if (
      settings
        .maintenanceMode &&
      !request.user.isAdmin
    ) {
      return response
        .status(503)
        .json({
          error:
            "MAINTENANCE"
        });
    }

    let newShift;

    try {
      await updateJson(
        "shifts.json",
        [],
        shifts => {
          const alreadyActive =
            shifts.some(
              shift =>
                shift.discordId ===
                  request.user
                    .discordId &&
                !shift.endAt
            );

          if (
            alreadyActive
          ) {
            throw new Error(
              "ALREADY_ON_DUTY"
            );
          }

          newShift = {
  id: createId(),

  discordId:
    request.user
      .discordId,

  username:
    request.user.displayName ||
    request.user.username,

  avatar:
    getProfileAvatar(
      request.user
    ),

  startAt:
    now(),

            endAt: null,

            endReason:
              null,

            edited:
              false,

            createdAt:
              now()
          };

          shifts.unshift(
            newShift
          );
        }
      );
    } catch (error) {
      if (
        error.message ===
        "ALREADY_ON_DUTY"
      ) {
        return response
          .status(409)
          .json({
            error:
              "ALREADY_ON_DUTY"
          });
      }

      throw error;
    }

    await audit(
      request.user.discordId,
      "SHIFT_START",
      request.user.discordId,
      {
        shiftId:
          newShift.id
      }
    );

    const startTimestamp = Math.floor(
    new Date(
      newShift.startAt
    ).getTime() / 1000
  );


await sendDiscordLog({
  title: "🟢  เริ่มปฏิบัติงาน",

  description:
    `### ${request.user.displayName}\n` +
    `> เริ่มปฏิบัติงานเรียบร้อยแล้ว`,

  fields: [
    {
      name: "👤 ผู้ปฏิบัติงาน",
      value:
        `<@${request.user.discordId}>\n` +
        `🎖️ ระดับ: **${getUserLevel(request.user)}**`,
      inline: false
    },

    {
      name: "━━━━━━━━━━━━━━━━━━",
      value: "🟢 **สถานะปัจจุบัน — กำลังเข้าเวร**",
      inline: false
    },

    {
      name: "🕐 เวลาเริ่มปฏิบัติงาน",
      value: `<t:${startTimestamp}:F>`,
      inline: false
    }
  ],

  color:
    0x57F287,

  thumbnail:
    getProfileAvatar(
      request.user
    )
});

    response.json({
      ok: true,
      shift:
        newShift
    });
  }
);

// =========================
// END SHIFT
// =========================

app.post(
  "/api/shifts/end",
  requireUser,

  async (
    request,
    response
  ) => {
    const settings =
      await getSettings();

    let endedShift;

    await updateJson(
      "shifts.json",
      [],
      shifts => {
        const shift =
          shifts.find(
            item =>
              item.discordId ===
                request.user
                  .discordId &&
              !item.endAt
          );

        if (!shift) {
          return;
        }

        shift.endAt =
          now();

        shift.endReason =
          "USER";

        endedShift =
          structuredClone(
            shift
          );
      }
    );

    if (!endedShift) {
      return response
        .status(409)
        .json({
          error:
            "NOT_ON_DUTY"
        });
    }

    const time =
  calculateTime(
    endedShift.startAt,
    endedShift.endAt,
    settings.normalHours,
    settings.allowOvertime
  );

    await audit(
      request.user.discordId,
      "SHIFT_END",
      request.user.discordId,
      {
        shiftId:
          endedShift.id
      }
    );

    const startTimestamp =
  Math.floor(
    new Date(
      endedShift.startAt
    ).getTime() / 1000
  );


const endTimestamp =
  Math.floor(
    new Date(
      endedShift.endAt
    ).getTime() / 1000
  );


await sendDiscordLog({
  title: "🔴  สิ้นสุดการปฏิบัติงาน",

  description:
    `### ${request.user.displayName}\n` +
    `> สิ้นสุดการปฏิบัติงานและบันทึกเวลาเรียบร้อยแล้ว`,

  fields: [
    {
  name: "👤 ผู้ปฏิบัติงาน",
  value:
    `<@${request.user.discordId}>\n` +
    `🎖️ ระดับ: **${getUserLevel(request.user)}**`,
  inline: false
},

    {
      name: "━━━━━━━━━━━━━━━━━━",
      value: "🔴 **สถานะ — ออกเวรแล้ว**",
      inline: false
    },

    {
      name: "🟢 เข้าเวร",
      value: `<t:${startTimestamp}:t>`,
      inline: true
    },

    {
      name: "🔴 ออกเวร",
      value: `<t:${endTimestamp}:t>`,
      inline: true
    },

    {
      name: "📅 วันที่",
      value: `<t:${endTimestamp}:D>`,
      inline: false
    },

    {
      name: "━━━━━━━━━━━━━━━━━━",
      value: "**สรุปเวลาปฏิบัติงาน**",
      inline: false
    },

    {
      name: "⏱️ เวลาปกติ",
      value: `**${formatDuration(time.normalMs)}**`,
      inline: true
    },

    {
      name: "🔥 OT",
      value:
        time.overtimeMs > 0
          ? `**${formatDuration(time.overtimeMs)}**`
          : "**ไม่มี OT**",
      inline: true
    },

    {
      name: "📊 รวมทั้งหมด",
      value: `### ${formatDuration(time.totalMs)}`,
      inline: false
    }
  ],

  color: 0xED4245,
  thumbnail:
  getProfileAvatar(
    request.user
  )
}); 

    response.json({
      ok: true,
      shift:
        endedShift,

      time
    });
  }
);

// =========================
// HISTORY
// =========================

app.get(
  "/api/history",
  requireUser,

  async (
    request,
    response
  ) => {
    const shifts =
      await readJson(
        "shifts.json",
        []
      );

    response.json(
      shifts
        .filter(
          shift =>
            shift.discordId ===
            request.user
              .discordId
        )
        .slice(0, 100)
    );
  }
);
// =====================================================
// HEAD ADMIN - DELETE ONE HISTORY
// =====================================================

app.delete(
  "/api/history/:id",
  requireUser,
  requireAdmin,

  async (request, response) => {

    try {

      const shifts =
        await readJson(
          "shifts.json",
          []
        );

      const index =
        shifts.findIndex(
          shift =>
            String(shift.id) ===
              String(request.params.id) &&
            String(shift.discordId) ===
              String(request.user.discordId)
        );

      if (index === -1) {
        return response
          .status(404)
          .json({
            error: "ไม่พบประวัติที่ต้องการลบ"
          });
      }

      if (!shifts[index].endAt) {
        return response
          .status(400)
          .json({
            error: "ไม่สามารถลบเวรที่กำลังทำงานอยู่ได้"
          });
      }

      const removed =
        shifts.splice(index, 1)[0];

      await writeJson(
        "shifts.json",
        shifts
      );

      await audit(
        request.user.discordId,
        "HISTORY_DELETE",
        request.user.discordId,
        {
          shiftId: removed.id
        }
      );

      return response.json({
        ok: true
      });

    } catch (error) {

      console.error(
        "DELETE HISTORY ERROR:",
        error
      );

      return response
        .status(500)
        .json({
          error: "ไม่สามารถลบประวัติได้"
        });
    }
  }
);


// =====================================================
// HEAD ADMIN - DELETE ALL OWN HISTORY
// =====================================================

app.delete(
  "/api/history",
  requireUser,
  requireAdmin,

  async (request, response) => {

    try {

      const shifts =
        await readJson(
          "shifts.json",
          []
        );

      let deletedCount = 0;

      const remaining =
        shifts.filter(shift => {

          const mine =
            String(shift.discordId) ===
            String(request.user.discordId);

          // ไม่ลบเวรที่กำลังทำงานอยู่
          if (mine && shift.endAt) {
            deletedCount++;
            return false;
          }

          return true;
        });

      await writeJson(
        "shifts.json",
        remaining
      );

      await audit(
        request.user.discordId,
        "HISTORY_DELETE_ALL",
        request.user.discordId,
        {
          deletedCount
        }
      );

      return response.json({
        ok: true,
        deleted: deletedCount
      });

    } catch (error) {

      console.error(
        "DELETE ALL HISTORY ERROR:",
        error
      );

      return response
        .status(500)
        .json({
          error: "ไม่สามารถลบประวัติทั้งหมดได้"
        });
    }
  }
);
// =========================
// LEAVE SYSTEM
// =========================

// -------------------------
// ดูประวัติการลาของตัวเอง
// -------------------------

app.get(
  "/api/leaves",
  requireUser,

  async (request, response) => {

    const leaves =
      await readJson(
        "leaves.json",
        []
      );

    const myLeaves =
      leaves
        .filter(
          leave =>
            String(leave.discordId) ===
            String(request.user.discordId)
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt) -
            new Date(a.createdAt)
        );

    response.json(myLeaves);
  }
);


// -------------------------
// ส่งคำขอลางาน
// -------------------------

app.post(
  "/api/leaves",
  requireUser,

  async (request, response) => {

    const allowedTypes = [
      "sick",
      "personal",
      "vacation",
      "other"
    ];

    const type =
      String(
        request.body?.type || ""
      ).trim();

    const startDate =
      String(
        request.body?.startDate || ""
      ).trim();

    const endDate =
      String(
        request.body?.endDate || ""
      ).trim();

    const reason =
      String(
        request.body?.reason || ""
      )
        .trim()
        .slice(0, 500);


    // ตรวจประเภทการลา
    if (
      !allowedTypes.includes(type)
    ) {

      return response
        .status(400)
        .json({
          error:
            "ประเภทการลาไม่ถูกต้อง"
        });
    }


    // ตรวจวันที่
    if (
      !/^\d{4}-\d{2}-\d{2}$/
        .test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/
        .test(endDate)
    ) {

      return response
        .status(400)
        .json({
          error:
            "กรุณาระบุวันที่ให้ถูกต้อง"
        });
    }


    if (endDate < startDate) {

      return response
        .status(400)
        .json({
          error:
            "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม"
        });
    }


    if (!reason) {

      return response
        .status(400)
        .json({
          error:
            "กรุณาระบุเหตุผลการลา"
        });
    }


    let leave;


    await updateJson(
      "leaves.json",
      [],

      leaves => {

        leave = {

          id:
            createId(),

          discordId:
            request.user.discordId,

          displayName:
            request.user.displayName ||
            request.user.username,

          username:
            request.user.username,

          type,

          startDate,

          endDate,

          reason,

          status:
            "pending",

          adminNote:
            "",

          reviewedBy:
            null,

          reviewedByName:
            null,

          reviewedAt:
            null,

          createdAt:
            now()
        };


        leaves.unshift(leave);
      }
    );


    // Audit ในเว็บไซต์
    await audit(
      request.user.discordId,
      "LEAVE_REQUEST",
      request.user.discordId,
      {
        leaveId:
          leave.id,

        type,

        startDate,

        endDate
      }
    );


    // Discord Log
    try {

      await sendLeaveDiscordLog({

        title:
          "📝 มีคำขอลางานใหม่",

        description:
          `### ${leave.displayName}\n` +
          `> ส่งคำขอลางานและกำลังรอ Head Admin พิจารณา`,

        fields: [

          {
            name:
              "👤 ผู้ยื่นคำขอ",

            value:
              `**${leave.displayName}**`,

            inline:
              false
          },

          {
            name:
              "📋 ประเภทการลา",

            value:
              type === "sick"
                ? "🤒 ลาป่วย"
                : type === "personal"
                ? "💼 ลากิจ"
                : type === "vacation"
                ? "🏖️ ลาพักร้อน"
                : "📝 อื่น ๆ",

            inline:
              true
          },

          {
            name:
              "📅 วันที่ลา",

            value:
              `**${startDate}** ถึง **${endDate}**`,

            inline:
              true
          },

          {
            name:
              "💬 เหตุผล",

            value:
              reason,

            inline:
              false
          },

          {
            name:
              "📌 สถานะ",

            value:
              "🟡 **รอการอนุมัติ**",

            inline:
              false
          }

        ],

        color:
          0xFEE75C,

        thumbnail:
          getProfileAvatar(
            request.user
          )
      });

    } catch (error) {

      console.error(
        "Discord LEAVE_REQUEST log error:",
        error
      );
    }


    return response
      .status(201)
      .json({
        ok: true,
        leave
      });
  }
);


// -------------------------
// Head Admin ดูคำขอลาทั้งหมด
// -------------------------

app.get(
  "/api/admin/leaves",
  requireUser,
  requireAdmin,

  async (request, response) => {

    const leaves =
      await readJson(
        "leaves.json",
        []
      );


    const sorted =
      [...leaves].sort(
        (a, b) => {

          if (
            a.status === "pending" &&
            b.status !== "pending"
          ) {
            return -1;
          }

          if (
            b.status === "pending" &&
            a.status !== "pending"
          ) {
            return 1;
          }

          return (
            new Date(b.createdAt) -
            new Date(a.createdAt)
          );
        }
      );


    response.json(sorted);
  }
);


// -------------------------
// Head Admin อนุมัติ / ไม่อนุมัติ
// -------------------------

app.patch(
  "/api/admin/leaves/:id",
  requireUser,
  requireAdmin,

  async (request, response) => {

    const status =
      String(
        request.body?.status || ""
      ).trim();


    const adminNote =
      String(
        request.body?.adminNote || ""
      )
        .trim()
        .slice(0, 500);


    if (
      ![
        "approved",
        "rejected"
      ].includes(status)
    ) {

      return response
        .status(400)
        .json({
          error:
            "สถานะไม่ถูกต้อง"
        });
    }


    let updated;


    await updateJson(
      "leaves.json",
      [],

      leaves => {

        const leave =
          leaves.find(
            item =>
              String(item.id) ===
              String(request.params.id)
          );


        if (!leave) {
          return;
        }


        // ป้องกันการกดซ้ำ
        if (
          leave.status !== "pending"
        ) {
          return;
        }


        leave.status =
          status;

        leave.adminNote =
          adminNote;

        leave.reviewedBy =
          request.user.discordId;


        // ชื่อผู้อนุมัติจากชื่อในเว็บไซต์
        leave.reviewedByName =
          request.user.displayName ||
          request.user.username;


        leave.reviewedAt =
          now();


        updated =
          structuredClone(leave);
      }
    );


    if (!updated) {

      return response
        .status(404)
        .json({
          error:
            "ไม่พบคำขอ หรือคำขอนี้ถูกดำเนินการแล้ว"
        });
    }


    // Audit
    await audit(
      request.user.discordId,

      status === "approved"
        ? "LEAVE_APPROVE"
        : "LEAVE_REJECT",

      updated.discordId,

      {
        leaveId:
          updated.id,

        adminNote,

        reviewedByName:
          updated.reviewedByName
      }
    );


    // Discord Log
    try {

      await sendLeaveDiscordLog({

        title:
          status === "approved"
            ? "✅ อนุมัติคำขอลางาน"
            : "❌ ไม่อนุมัติคำขอลางาน",

        description:
          status === "approved"
            ? `### ${updated.displayName}\n> คำขอลางานได้รับการอนุมัติแล้ว`
            : `### ${updated.displayName}\n> คำขอลางานไม่ได้รับการอนุมัติ`,

        fields: [

          {
            name:
              "👤 ผู้ยื่นคำขอ",

            value:
              `**${
                updated.displayName ||
                updated.username
              }**`,

            inline:
              false
          },

          {
            name:
              "📋 ประเภทการลา",

            value:
              updated.type === "sick"
                ? "🤒 ลาป่วย"
                : updated.type === "personal"
                ? "💼 ลากิจ"
                : updated.type === "vacation"
                ? "🏖️ ลาพักร้อน"
                : "📝 อื่น ๆ",

            inline:
              true
          },

          {
            name:
              "📅 วันที่ลา",

            value:
              `**${updated.startDate}** ถึง **${updated.endDate}**`,

            inline:
              true
          },

          {
            name:
              "💬 เหตุผลการลา",

            value:
              updated.reason || "-",

            inline:
              false
          },

          {
            name:
              status === "approved"
                ? "✅ ผู้อนุมัติ"
                : "❌ ผู้ไม่อนุมัติ",

            // ใช้ชื่อที่ตั้งในเว็บไซต์
            // ไม่ใช้ตำแหน่ง Head Admin
            value:
              `**${updated.reviewedByName}**`,

            inline:
              false
          },

          {
            name:
              "📌 ผลการพิจารณา",

            value:
              status === "approved"
                ? "🟢 **อนุมัติ**"
                : "🔴 **ไม่อนุมัติ**",

            inline:
              true
          },

          {
            name:
              "💬 หมายเหตุ",

            value:
              updated.adminNote || "-",

            inline:
              false
          }

        ],

        color:
          status === "approved"
            ? 0x57F287
            : 0xED4245
      });

    } catch (error) {

      console.error(
        "Discord LEAVE_REVIEW log error:",
        error
      );
    }


    return response.json({
      ok: true,
      leave: updated
    });
  }
);
// -------------------------
// Head Admin ลบคำขอลางาน
// -------------------------

app.delete(
  "/api/admin/leaves/:id",
  requireUser,
  requireAdmin,

  async (request, response) => {

    let deleted = null;


    await updateJson(
      "leaves.json",
      [],

      leaves => {

        const index =
          leaves.findIndex(
            item =>
              String(item.id) ===
              String(request.params.id)
          );


        if (index === -1) {
          return;
        }


        deleted =
          structuredClone(
            leaves[index]
          );


        leaves.splice(
          index,
          1
        );
      }
    );


    if (!deleted) {

      return response
        .status(404)
        .json({
          error:
            "ไม่พบคำขอลางาน"
        });
    }


    // =========================
    // AUDIT
    // =========================

    await audit(
      request.user.discordId,
      "LEAVE_DELETE",
      deleted.discordId,
      {
        leaveId:
          deleted.id,

        displayName:
          deleted.displayName ||
          deleted.username
      }
    );


    // =========================
    // DISCORD LOG
    // =========================

    try {

      await sendDiscordLog({

        title:
          "🗑️ ลบคำขอลางาน",

        description:
          `คำขอลางานของ **${
            deleted.displayName ||
            deleted.username ||
            "ไม่ทราบชื่อ"
          }** ถูกลบออกจากระบบ`,

        fields: [

          {
            name:
              "👤 ผู้ยื่นคำขอ",

            value:
              `**${
                deleted.displayName ||
                deleted.username ||
                "-"
              }**`,

            inline:
              false
          },


          {
            name:
              "🗑️ ผู้ลบ",

            value:
              `**${
                request.user.displayName ||
                request.user.username
              }**`,

            inline:
              false
          }

        ],

        color:
          0xED4245
      });


    } catch (error) {

      console.error(
        "Discord LEAVE_DELETE log error:",
        error
      );

    }


    return response.json({
      ok: true
    });
  }
);
// =========================
// ADMIN OVERVIEW
// =========================

app.get(
  "/api/admin/overview",
  requireUser,
  requireAdmin,

  async (
    request,
    response
  ) => {
    const users =
      await readJson(
        "users.json",
        []
      );

    const shifts =
      await readJson(
        "shifts.json",
        []
      );

    const logs =
      await readJson(
        "audit.json",
        []
      );
    const leaves =
      await readJson(
        "leaves.json",
        []
      );

    const settings =
      await getSettings();

    response.json({
      users,
      leaves,
      active:
        shifts.filter(
          shift =>
            !shift.endAt
        ),

      shifts:
        shifts.slice(
          0,
          500
        ),

      audit:
        logs.slice(
          0,
          200
        ),

      settings
    });
  }
);
// =========================
// ADMIN ADD USER
// =========================

app.post(
  "/api/admin/users",
  requireUser,
  requireAdmin,

  async (request, response) => {
    try {
      const discordId = String(
        request.body?.discordId || ""
      ).trim();

      const displayName = String(
  request.body?.displayName ||
  request.body?.name ||
  request.body?.username ||
  ""
)
  .trim()
  .slice(0, 50);

      /*
        Frontend ส่งมาได้ทั้ง:

        level: "Head Admin"
        level: "Admin"

        หรือ
        isAdmin: true / false
      */
      const isAdmin =
        request.body?.level === "Head Admin" ||
        request.body?.isAdmin === true;

      // -------------------------
      // VALIDATE
      // -------------------------

      if (!discordId) {
        return response
          .status(400)
          .json({
            error: "กรุณากรอก Discord User ID"
          });
      }

      if (!/^\d{15,25}$/.test(discordId)) {
        return response
          .status(400)
          .json({
            error: "Discord User ID ไม่ถูกต้อง"
          });
      }

      if (!displayName) {
        return response
          .status(400)
          .json({
            error: "กรุณากรอกชื่อแสดงผล"
          });
      }

      let newUser = null;
      let alreadyExists = false;

      // -------------------------
      // ADD USER
      // -------------------------

      await updateJson(
        "users.json",
        [],
        users => {
          const exists = users.some(
            user =>
              String(user.discordId) ===
              String(discordId)
          );

          if (exists) {
            alreadyExists = true;
            return;
          }

          newUser = {
            discordId,

            /*
              ตอนเพิ่มจากหน้า Admin
              เรายังไม่รู้ Discord username จริง
              ระบบจะอัปเดตให้ตอนเจ้าตัว Login Discord
            */
            username: displayName,

            displayName,

            discordUsername: null,

            avatar: null,

            customAvatar: null,

            enabled: true,

            isAdmin,

            /*
              ผู้ใช้ใหม่ยังมีสิทธิ์
              เปลี่ยนชื่อด้วยตัวเอง 1 ครั้ง
            */
            displayNameChanged: false,

            createdAt: now(),

            lastLoginAt: null
          };

          users.push(newUser);
        }
      );

      // -------------------------
      // ALREADY EXISTS
      // -------------------------

      if (alreadyExists) {
        return response
          .status(409)
          .json({
            error: "Discord ID นี้มีอยู่ในระบบแล้ว"
          });
      }

      if (!newUser) {
        return response
          .status(500)
          .json({
            error: "ไม่สามารถเพิ่มบุคลากรได้"
          });
      }

      // -------------------------
      // AUDIT
      // -------------------------

      await audit(
        request.user.discordId,
        "USER_CREATE",
        discordId,
        {
          displayName,
          isAdmin
        }
      );

      // -------------------------
      // DISCORD LOG
      // -------------------------

      try {
        await sendAdminDiscordLog({
          title: "👤 เพิ่มบุคลากร",

          description:
            `เพิ่มบุคลากรเข้าสู่ระบบเรียบร้อยแล้ว`,

          fields: [
            {
              name: "ผู้ใช้งาน",
              value:
                `<@${discordId}>\n` +
                `ชื่อแสดงผล: **${displayName}**`,
              inline: false
            },

            {
              name: "ระดับ",
              value:
                isAdmin
                  ? "**Head Admin**"
                  : "**Admin**",
              inline: true
            },

            {
              name: "เพิ่มโดย",
              value:
                `<@${request.user.discordId}>`,
              inline: true
            }
          ],

          color: 0x57F287
        });
      } catch (error) {
        /*
          Webhook มีปัญหา
          ไม่ควรทำให้การเพิ่ม user ล้มเหลว
        */
        console.error(
          "Discord USER_CREATE log error:",
          error
        );
      }

      // -------------------------
      // RESPONSE
      // -------------------------

      return response
        .status(201)
        .json({
          ok: true,
          user: normalizeUser(newUser)
        });

    } catch (error) {
      console.error(
        "ADD USER ERROR:",
        error
      );

      return response
        .status(500)
        .json({
          error: "ไม่สามารถเพิ่มบุคลากรได้"
        });
    }
  }
);
// =========================
// ADMIN USERS
// =========================

app.patch(
  "/api/admin/users/:id",
  requireUser,
  requireAdmin,

  async (
    request,
    response
  ) => {
    const allowed = [
  "enabled",
  "isAdmin",
  "displayName"
];

    const patch =
      Object.fromEntries(
        Object.entries(
          request.body || {}
        ).filter(
          ([key]) =>
            allowed.includes(
              key
            )
        )
      );

    let updated;

    await updateJson(
      "users.json",
      [],
      users => {
        const user =
          users.find(
            item =>
              item.discordId ===
              request.params.id
          );

        if (!user) {
          return;
        }

        Object.assign(
          user,
          patch
        );

        updated =
          structuredClone(
            user
          );
      }
    );

    if (!updated) {
      return response
        .status(404)
        .json({
          error:
            "NOT_FOUND"
        });
    }

    await audit(
      request.user.discordId,
      "USER_UPDATE",
      request.params.id,
      patch
    );

    response.json({
      ok: true,
      user:
        updated
    });
  }
);
// =========================
// ADMIN DELETE USER
// =========================

app.delete(
  "/api/admin/users/:id",
  requireUser,
  requireAdmin,

  async (request, response) => {
    try {

      const targetId =
        String(request.params.id || "").trim();

      if (!targetId) {
        return response.status(400).json({
          error: "ไม่พบ Discord ID"
        });
      }


      // ป้องกัน Head Admin ลบตัวเอง
      if (
        String(request.user.discordId) ===
        targetId
      ) {
        return response.status(400).json({
          error: "ไม่สามารถลบบัญชีของตัวเองได้"
        });
      }


      let deletedUser = null;


      await updateJson(
        "users.json",
        [],
        users => {

          const index =
            users.findIndex(
              user =>
                String(user.discordId) ===
                targetId
            );


          if (index === -1) {
            return;
          }


          deletedUser =
            users[index];


          users.splice(
            index,
            1
          );

        }
      );


      if (!deletedUser) {
        return response.status(404).json({
          error: "ไม่พบบุคลากร"
        });
      }


      // =========================
      // AUDIT
      // =========================

      await audit(
        request.user.discordId,
        "USER_DELETE",
        targetId,
        {
          displayName:
            deletedUser.displayName ||
            deletedUser.username ||
            targetId,

          isAdmin:
            Boolean(deletedUser.isAdmin)
        }
      );


      // =========================
      // DISCORD WEBHOOK
      // =========================

      try {

        await sendAdminDiscordLog({

          title:
            "🗑️ ลบบุคลากร",

          description:
            "ลบบุคลากรออกจากระบบเรียบร้อยแล้ว",

          fields: [

            {
              name:
                "บุคลากรที่ถูกลบ",

              value:
                `**${
                  deletedUser.displayName ||
                  deletedUser.username ||
                  "ไม่ทราบชื่อ"
                }**\n` +
                `Discord ID: \`${targetId}\``,

              inline:
                false
            },

            {
              name:
                "ระดับ",

              value:
                deletedUser.isAdmin
                  ? "**Head Admin**"
                  : "**Admin**",

              inline:
                true
            },

            {
              name:
                "ดำเนินการโดย",

              value:
                `<@${request.user.discordId}>`,

              inline:
                true
            }

          ],

          color:
            0xED4245

        });

      } catch (error) {

        console.error(
          "Discord USER_DELETE log error:",
          error
        );

      }


      return response.json({
        ok: true,
        deletedId: targetId
      });


    } catch (error) {

      console.error(
        "DELETE USER ERROR:",
        error
      );


      return response.status(500).json({
        error: "ไม่สามารถลบบุคลากรได้"
      });

    }
  }
);
// =========================
// ADMIN FORCE END
// =========================

app.post(
  "/api/admin/shifts/:id/force-end",
  requireUser,
  requireAdmin,

  async (
    request,
    response
  ) => {
    const settings =
      await getSettings();

    let ended;

    await updateJson(
      "shifts.json",
      [],
      shifts => {
        const shift =
          shifts.find(
            item =>
              item.id ===
                request.params.id &&
              !item.endAt
          );

        if (!shift) {
          return;
        }

        shift.endAt =
          now();

        shift.endReason =
          "ADMIN_FORCE";

        shift.edited =
          true;

        ended =
          structuredClone(
            shift
          );
      }
    );

    if (!ended) {
      return response
        .status(404)
        .json({
          error:
            "SHIFT_NOT_FOUND"
        });
    }

    const time =
  calculateTime(
    ended.startAt,
    ended.endAt,
    settings.normalHours,
    settings.allowOvertime
  );

    await audit(
      request.user.discordId,
      "ADMIN_FORCE_END",
      ended.discordId,
      {
        shiftId:
          ended.id
      }
    );

    await sendDiscordLog({
      title:
        "🛡️ Admin บังคับออกเวร",

      description:
        `<@${ended.discordId}> ถูกบังคับออกเวรโดย <@${request.user.discordId}>`,

      fields: [
        {
          name:
            "เวลาปกติ",

          value:
            formatDuration(
              time.normalMs
            ),

          inline:
            true
        },

        {
          name: "OT",

          value:
            formatDuration(
              time.overtimeMs
            ),

          inline:
            true
        }
      ],

      color:
        0xfee75c
    });

    response.json({
      ok: true
    });
  }
);

// =========================
// ADMIN DELETE SHIFT
// =========================

app.delete(
  "/api/admin/shifts/:id",
  requireUser,
  requireAdmin,

  async (
    request,
    response
  ) => {
    let removed;

    await updateJson(
      "shifts.json",
      [],
      shifts => {
        const index =
          shifts.findIndex(
            shift =>
              shift.id ===
              request.params.id
          );

        if (index >= 0) {
          removed =
            shifts.splice(
              index,
              1
            )[0];
        }
      }
    );

    if (!removed) {
      return response
        .status(404)
        .json({
          error:
            "NOT_FOUND"
        });
    }

    await audit(
      request.user.discordId,
      "SHIFT_DELETE",
      removed.discordId,
      {
        shift:
          removed
      }
    );

    response.json({
      ok: true
    });
  }
);

// =========================
// ADMIN SETTINGS
// =========================

app.patch(
  "/api/admin/settings",
  requireUser,
  requireAdmin,

  async (
    request,
    response
  ) => {
    const oldSettings =
      await getSettings();

    const newSettings = {
      ...oldSettings
    };

    const allowed = [
      "organizationName",
      "normalHours",
      "forceClockOutHours",
      "autoClockOut",
      "allowOvertime",
      "timezone",
      "maintenanceMode"
    ];

    for (
      const key of allowed
    ) {
      if (
        request.body?.[key] !==
        undefined
      ) {
        newSettings[key] =
          request.body[key];
      }
    }

    newSettings.normalHours =
      Math.max(
        0.25,
        Number(
          newSettings.normalHours
        )
      );

    newSettings.forceClockOutHours =
      Math.max(
        newSettings.normalHours,
        Number(
          newSettings
            .forceClockOutHours
        )
      );

    await writeJson(
      "settings.json",
      newSettings
    );

    await audit(
      request.user.discordId,
      "SETTINGS_UPDATE",
      null,
      {
        before:
          oldSettings,

        after:
          newSettings
      }
    );

    response.json({
      ok: true,
      settings:
        newSettings
    });
  }
);

// =========================
// AUTO CLOCK OUT
// =========================

async function autoClockOut() {
  const settings =
    await getSettings();

  if (
    !settings.autoClockOut
  ) {
    return;
  }

  const maxMs =
    Number(
      settings
        .forceClockOutHours
    ) *
    60 *
    60 *
    1000;

  const ended = [];

  await updateJson(
    "shifts.json",
    [],
    shifts => {
      const current =
        Date.now();

      for (
        const shift of shifts
      ) {
        if (shift.endAt) {
          continue;
        }

        const start =
          new Date(
            shift.startAt
          ).getTime();

        if (
          current - start >=
          maxMs
        ) {
          shift.endAt =
            new Date(
              start + maxMs
            ).toISOString();

          shift.endReason =
            "AUTO_FORCE";

          ended.push(
            structuredClone(
              shift
            )
          );
        }
      }
    }
  );

  for (
    const shift of ended
  ) {
    const time =
  calculateTime(
    shift.startAt,
    shift.endAt,
    settings.normalHours,
    settings.allowOvertime
  );

    await audit(
      "SYSTEM",
      "AUTO_FORCE_END",
      shift.discordId,
      {
        shiftId:
          shift.id
      }
    );

    await sendDiscordLog({
      title:
        "⏰ ออกเวรอัตโนมัติ",

      description:
        `<@${shift.discordId}> ครบเวลาสูงสุด ${settings.forceClockOutHours} ชั่วโมง`,

      fields: [
        {
          name:
            "เวลาปกติ",

          value:
            formatDuration(
              time.normalMs
            ),

          inline:
            true
        },

        {
          name: "OT",

          value:
            formatDuration(
              time.overtimeMs
            ),

          inline:
            true
        }
      ],

      color:
        0xfee75c
    });
  }
}
await initDatabase();
autoClockOut()
  .catch(console.error);

setInterval(
  () => {
    autoClockOut()
      .catch(console.error);
  },
  60 * 1000
);

// =========================
// START SERVER
// ========================

app.listen(
  PORT,
  () => {
    console.log(
      "================================"
    );

    console.log(
      " Duty Management System"
    );

    console.log(
      ` ${BASE_URL}`
    );

    console.log(
      "================================"
    );
  }
);
// ========================================
// ADMIN DISCORD WEBHOOK
// เพิ่ม / ลบ / แก้ไข บุคลากร
// ========================================

async function sendAdminDiscordLog(embed) {
  const webhookUrl =
    process.env.DISCORD_ADMIN_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log(
      "DISCORD_ADMIN_WEBHOOK_URL not configured"
    );
    return;
  }

  try {
    const webhookResponse = await fetch(
      webhookUrl,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          username: "Duty Management • Admin Log",

          embeds: [
            {
              ...embed,
              timestamp: new Date().toISOString()
            }
          ]
        })
      }
    );

    if (!webhookResponse.ok) {
      const text =
        await webhookResponse.text();

      console.error(
        "ADMIN WEBHOOK ERROR:",
        webhookResponse.status,
        text
      );
    }

  } catch (error) {
    console.error(
      "ADMIN WEBHOOK ERROR:",
      error
    );
  }
}