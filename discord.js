const DISCORD_API =
  "https://discord.com/api/v10";

export function getDiscordLoginURL(state) {
  const params = new URLSearchParams({
    client_id:
      process.env.DISCORD_CLIENT_ID,

    response_type:
      "code",

    redirect_uri:
      process.env.DISCORD_REDIRECT_URI,

    scope:
      "identify guilds.members.read",

    state
  });

  return (
    "https://discord.com/oauth2/authorize?" +
    params.toString()
  );
}

export async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id:
      process.env.DISCORD_CLIENT_ID,

    client_secret:
      process.env.DISCORD_CLIENT_SECRET,

    grant_type:
      "authorization_code",

    code,

    redirect_uri:
      process.env.DISCORD_REDIRECT_URI
  });

  const response = await fetch(
    `${DISCORD_API}/oauth2/token`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded"
      },

      body
    }
  );

  if (!response.ok) {
    throw new Error(
      "Discord OAuth Token Error"
    );
  }

  return response.json();
}

export async function getDiscordUser(
  accessToken
) {
  const response = await fetch(
    `${DISCORD_API}/users/@me`,
    {
      headers: {
        Authorization:
          `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      "Cannot get Discord user"
    );
  }

  return response.json();
}

export async function getGuildMember(
  accessToken,
  guildId
) {
  const response = await fetch(
    `${DISCORD_API}/users/@me/guilds/${guildId}/member`,
    {
      headers: {
        Authorization:
          `Bearer ${accessToken}`
      }
    }
  );

  if (!response.ok) {
    return null;
  }

  return response.json();
}

export function getAvatarURL(user) {
  if (!user.avatar) {
    return null;
  }

  return (
    `https://cdn.discordapp.com/avatars/` +
    `${user.id}/${user.avatar}.png?size=256`
  );
}

export async function sendDiscordLog({
  title,
  description = "",
  fields = [],
  color = 0x5865f2,
  thumbnail = null
}) {
  const webhook =
    process.env.DISCORD_WEBHOOK_URL;

  if (!webhook) {
    return;
  }

  const embed = {
    title,
    description,
    color,
    fields,
    timestamp:
      new Date().toISOString(),

    footer: {
      text: "Duty Management System"
    }
  };

  if (thumbnail) {
    embed.thumbnail = {
      url: thumbnail
    };
  }

  try {
    const response = await fetch(
      webhook,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body: JSON.stringify({
          username: "Duty System",
          embeds: [embed]
        })
      }
    );

    if (!response.ok) {
      console.error(
        "Webhook Error:",
        response.status
      );
    }
  } catch (error) {
    console.error(
      "Discord Webhook Error:",
      error
    );
  }
}
export async function sendLeaveDiscordLog(embed) {
  const webhookUrl =
    process.env.DISCORD_LEAVE_WEBHOOK_URL;

  if (!webhookUrl) {
    console.log(
      "DISCORD_LEAVE_WEBHOOK_URL not configured"
    );
    return;
  }

  try {
    const webhookResponse =
      await fetch(
        webhookUrl,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            username:
              "Duty Management • Leave Log",

            embeds: [
              {
                ...embed,
                timestamp:
                  new Date().toISOString()
              }
            ]
          })
        }
      );

    if (!webhookResponse.ok) {
      const text =
        await webhookResponse.text();

      console.error(
        "LEAVE WEBHOOK ERROR:",
        webhookResponse.status,
        text
      );
    }

  } catch (error) {
    console.error(
      "LEAVE WEBHOOK ERROR:",
      error
    );
  }
}