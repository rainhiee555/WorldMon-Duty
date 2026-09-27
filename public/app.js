const $ = s => document.querySelector(s);

let state = null;
let timer = null;
let adminData = null;
let adminLeavesData = [];
let dashboardChartShifts = [];
let dashboardChartRange = "7";


// =============================
// API
// =============================

async function api(url, options = {}) {

  const opts = {
    ...options
  };

  if (!(opts.body instanceof FormData)) {

    opts.headers = {
      "Content-Type": "application/json",
      ...(opts.headers || {})
    };

  }

  const response =
    await fetch(url, opts);

  const isJson =
    response.headers
      .get("content-type")
      ?.includes("application/json");

  const data =
    isJson
      ? await response.json()
      : await response.text();

  if (!response.ok) {

    throw new Error(
      data?.error ||
      data ||
      "Request failed"
    );

  }

  return data;
}


// =============================
// HELPERS
// =============================

function esc(value) {

  return String(value ?? "")
    .replace(
      /[&<>"']/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[char]
    );

}


function dt(value) {

  if (!value) {
    return "-";
  }

  return new Date(value)
    .toLocaleString("th-TH");

}


function dur(ms) {

  ms = Math.max(
    0,
    ms
  );

  const seconds =
    Math.floor(ms / 1000);

  const hours =
    Math.floor(seconds / 3600);

  const minutes =
    Math.floor(
      (seconds % 3600) / 60
    );

  const remain =
    seconds % 60;

  return [
    hours,
    minutes,
    remain
  ]
    .map(
      value =>
        String(value)
          .padStart(2, "0")
    )
    .join(":");

}


function hours(value) {

  return `${Number(
    value || 0
  ).toFixed(1)} ชม.`;

}


function avatar(user) {

  return (
    user?.profileAvatar ||
    user?.customAvatar ||
    user?.avatar ||
    ""
  );

}


function level(user) {

  return user?.isAdmin
    ? "Head Admin"
    : "Admin";

}


function levelBadge(user) {

  return `
    <span
      class="role-badge ${
        user?.isAdmin
          ? "head"
          : "user"
      }"
    >
      ${
        user?.isAdmin
          ? "👑"
          : "🛡️"
      }

      ${level(user)}
    </span>
  `;

}


// =============================
// LOAD
// =============================

async function load() {

  state =
    await api("/api/me");

  $("#organization")
    .textContent =
    state.settings.organizationName;

  if (!state.authenticated) {

    showLogin();

    return;

  }

  showHeader();

  showDashboard();

}


// =============================
// LOGIN
// =============================

function showLogin() {

  $("#profile")
    .innerHTML = "";

  $("#app")
    .innerHTML = `

      <div class="card center">

        <h2>
          ระบบเข้าเวร
        </h2>

        <p class="muted">
          กรุณาเข้าสู่ระบบด้วย Discord
        </p>

        <br>

        <a
          class="button blue"
          href="/auth/discord"
        >
          Login with Discord
        </a>

      </div>

    `;

}


// =============================
// HEADER
// =============================

function showHeader() {

  const user =
    state.user;

  $("#profile")
    .innerHTML = `

      <button
        class="profile-chip"
        onclick="showMyProfile()"
      >

        ${
          avatar(user)
            ? `
              <img
                class="avatar"
                src="${esc(
                  avatar(user)
                )}"
              >
            `
            : ""
        }

        <span>

          <strong>
            ${esc(
              user.displayName ||
              user.username
            )}
          </strong>

          <small>
            ${
              user.isAdmin
                ? "Head Admin"
                : "Admin"
            }
          </small>

        </span>

      </button>

    `;

}


// =============================
// NAVIGATION
// =============================

function nav(active) {

  return `

    <div class="tabs">

      <button
        class="${
          active === "home"
            ? "active"
            : ""
        }"
        onclick="showDashboard()"
      >
        หน้าหลัก
      </button>

      <button
        class="${
          active === "history"
            ? "active"
            : ""
        }"
        onclick="showHistory()"
      >
        ประวัติ
      </button>

      <button
        class="${
          active === "profile"
            ? "active"
            : ""
        }"
        onclick="showMyProfile()"
      >
        โปรไฟล์
      </button>

      <button
        class="${
          active === "leave"
            ? "active"
            : ""
        }"
        onclick="showLeave()"
      >
        ลางาน
      </button>

      
      ${
        state.user.isAdmin
          ? `

            <button
              class="${
                active === "admin"
                  ? "active"
                  : ""
              }"
              onclick="showAdmin()"
            >
              จัดการระบบ
            </button>

          `
          : ""
      }

      <button
        class="gray"
        onclick="logout()"
      >
        ออกจากระบบ
      </button>

    </div>

  `;

}


// =============================
// DASHBOARD
// =============================

async function showDashboard() {
  clearInterval(timer);

  try {
    const freshState = await api("/api/me");

    if (freshState?.authenticated) {
      state = freshState;
    }
  } catch (error) {
    console.error("โหลดสถานะปัจจุบันไม่สำเร็จ:", error);
  }

  const shift = state.activeShift;
  const user = state.user;

  let shifts = [];

  try {
    shifts = await api("/api/history");
  } catch (error) {
    console.error("โหลดประวัติไม่สำเร็จ:", error);
    shifts = [];
  }

const summary = getTodaySummary(shifts);
const recentShifts = getDashboardRecentShifts(shifts);


dashboardChartShifts = shifts;

const chartData = getDashboardChartData(
  dashboardChartShifts,
  dashboardChartRange
);

  const userName =
    user.displayName ||
    user.username ||
    "ผู้ใช้งาน";

  const today = new Date();

  const dateText = today.toLocaleDateString(
    "th-TH",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }
  );

  $("#app").innerHTML = `

    ${nav("home")}

    <div class="home-dashboard">

      <!-- =========================
           TOP WELCOME
      ========================== -->

      <section class="home-welcome">

        <div class="home-welcome-user">

          ${
            avatar(user)
              ? `
                <img
                  class="home-welcome-avatar"
                  src="${esc(avatar(user))}"
                  alt=""
                >
              `
              : `
                <div class="home-welcome-avatar home-avatar-placeholder">
                  ${esc(userName.charAt(0).toUpperCase())}
                </div>
              `
          }

          <div class="home-welcome-copy">

            <span class="home-greeting">
              ยินดีต้อนรับ
            </span>

            <div class="home-name-row">

              <h1>
                ${esc(userName)}
              </h1>

              ${levelBadge(user)}

            </div>

            <p>
              ระบบจัดการเวลาปฏิบัติงาน
            </p>

          </div>

        </div>


        <div class="home-date-card">

          <div class="home-date-icon">
            ◫
          </div>

          <div>
            <span>วันนี้</span>

            <strong>
              ${esc(dateText)}
            </strong>
          </div>

        </div>

      </section>


      <!-- =========================
           HERO
      ========================== -->

      <section class="home-hero-grid">

        <div class="home-duty-hero ${
          shift ? "is-working" : ""
        }">

          <div class="home-duty-content">

            <div class="home-status-label">

              <span class="home-status-dot"></span>

              ${
                shift
                  ? "กำลังปฏิบัติงาน"
                  : "สถานะการปฏิบัติงาน"
              }

            </div>

            ${
              shift
                ? `

                  <h2>
                    กำลังเข้าเวร
                  </h2>

                  <p>
                    ระบบกำลังบันทึกเวลาปฏิบัติงานของคุณ
                  </p>

                  <div class="home-live-time">

                    <div>
                      <span>เวลาปกติ</span>
                      <strong id="normalTime">
                        00:00:00
                      </strong>
                    </div>

                    <div class="ot">
                      <span>OT</span>
                      <strong id="otTime">
                        00:00:00
                      </strong>
                    </div>

                  </div>

                  <div class="home-duty-started">
                    เข้าเวรเมื่อ
                    <strong>
                      ${dt(shift.startAt)}
                    </strong>
                  </div>

                  <button
                    class="home-duty-button end"
                    onclick="endShift()"
                  >
                    <span>■</span>
                    ออกเวร
                    <b>→</b>
                  </button>

                `
                : `

                  <h2>
                    พร้อมเริ่มปฏิบัติงาน
                  </h2>

                  <p>
                    ระบบจะบันทึกเวลาเข้าเวร
                    และคำนวณเวลาปฏิบัติงานให้อัตโนมัติ
                  </p>

                  <button
                    class="home-duty-button"
                    onclick="startShift()"
                  >
                    <span>▶</span>
                    เข้าเวร
                    <b>→</b>
                  </button>

                `
            }

          </div>


          <div class="home-duty-art">

            <div class="home-art-orbit orbit-one"></div>
            <div class="home-art-orbit orbit-two"></div>

            <div class="home-art-card">
              <span class="home-art-line"></span>
              <span class="home-art-line short"></span>
              <span class="home-art-line"></span>

              <div class="home-art-clock">
                <span></span>
              </div>
            </div>

          </div>

        </div>


        <aside class="home-current-status">

          <div class="home-current-icon">
            ◎
          </div>

          <div class="home-current-copy">

            <h3>
              ภาพรวมการปฏิบัติงาน
            </h3>

            <p>
              ตรวจสอบสถานะและเวลา
              ปฏิบัติงานของคุณในปัจจุบัน
            </p>

          </div>

          <div class="home-current-pill ${
            shift ? "working" : ""
          }">

            <span></span>

            ${
              shift
                ? "กำลังเข้าเวร"
                : "ยังไม่ได้เข้าเวร"
            }

          </div>

        </aside>

      </section>


      <!-- =========================
           KPI
      ========================== -->

      <section class="home-kpi-grid">

        <article class="home-kpi blue">

          <div class="home-kpi-icon">
            ◷
          </div>

          <div class="home-kpi-content">

            <span>
              เวลาทำงานวันนี้
            </span>

            <strong>
              ${formatWorkHours(summary.totalHours)}
            </strong>

            <small>
              เวลาปฏิบัติงานรวม
            </small>

          </div>

        </article>


        <article class="home-kpi orange">

          <div class="home-kpi-icon">
            ⚡
          </div>

          <div class="home-kpi-content">

            <span>
              OT วันนี้
            </span>

            <strong>
              ${formatWorkHours(summary.overtimeHours)}
            </strong>

            <small>
              เวลาทำงานล่วงเวลา
            </small>

          </div>

        </article>


        <article class="home-kpi green">

          <div class="home-kpi-icon">
            ✓
          </div>

          <div class="home-kpi-content">

            <span>
              เข้าเวรวันนี้
            </span>

            <strong>
              ${summary.shifts} ครั้ง
            </strong>

            <small>
              จำนวนครั้งที่เข้าเวร
            </small>

          </div>

        </article>


        <article class="home-kpi purple">

          <div class="home-kpi-icon">
            ◉
          </div>

          <div class="home-kpi-content">

            <span>
              สถานะปัจจุบัน
            </span>

            <strong class="home-kpi-status">
              ${
                shift
                  ? "เข้าเวร"
                  : "พัก"
              }
            </strong>

            <small>
              สถานะการปฏิบัติงาน
            </small>

          </div>

        </article>

      </section>


      <!-- =========================
           BOTTOM GRID
      ========================== -->

      <section class="home-bottom-grid">

        <!-- CHART -->

        <div class="home-panel home-chart-panel">

          <div class="home-panel-header">

            <div>

              <div class="home-panel-title">

                <span class="home-panel-icon">
                  ▥
                </span>

                <div>
                  <h3>
                    กราฟสรุปการทำงาน
                  </h3>

<p id="homeChartDescription">
  ภาพรวมเวลาปฏิบัติงานย้อนหลัง 7 วัน
</p>
                </div>

              </div>

            </div>

            <select
  id="homeChartRange"
  class="home-chart-range"
  onchange="changeHomeChartRange(this.value)"
>
  <option value="7">7 วันล่าสุด</option>
  <option value="14">14 วันล่าสุด</option>
  <option value="30">30 วันล่าสุด</option>
  <option value="thisMonth">เดือนนี้</option>
  <option value="lastMonth">เดือนที่แล้ว</option>
</select>

          </div>


          <div class="home-chart-legend">

            <span>
              <i class="normal"></i>
              เวลาปกติ
            </span>

            <span>
              <i class="ot"></i>
              OT
            </span>

          </div>


          <div id="homeDutyChart">
  ${dashboardHomeChartHTML(chartData)}
</div>

        </div>


        <!-- RECENT -->

        <div class="home-panel home-recent-panel">

          <div class="home-panel-header">

            <div class="home-panel-title">

              <span class="home-panel-icon">
                ◷
              </span>

              <div>
                <h3>
                  การเข้าเวรล่าสุด
                </h3>

                <p>
                  รายการล่าสุดของคุณ
                </p>
              </div>

            </div>

            <button
              class="home-view-all"
              onclick="showHistory()"
            >
              ดูทั้งหมด →
            </button>

          </div>


          <div class="home-recent-list">

            ${
              recentShifts.length
                ? recentShifts
                    .map(
                      item =>
                        dashboardRecentShiftHTML(item)
                    )
                    .join("")
                : `

                  <div class="home-empty">

                    <div class="home-empty-icon">
                      ◷
                    </div>

                    <strong>
                      ยังไม่มีประวัติการเข้าเวร
                    </strong>

                    <span>
                      รายการล่าสุดจะแสดงที่นี่
                    </span>

                  </div>

                `
            }

          </div>

        </div>

      </section>

    </div>
  `;


  if (shift) {

    updateTimer();

    timer = setInterval(
      updateTimer,
      1000
    );

  }
}
function getDashboardRecentShifts(shifts) {

  return [...shifts]
    .filter(
      shift =>
        shift?.startAt
    )
    .sort(
      (a, b) =>
        new Date(b.startAt) -
        new Date(a.startAt)
    )
    .slice(0, 4);

}


function dashboardRecentShiftHTML(shift) {

  const start =
    new Date(shift.startAt);

  const end =
    shift.endAt
      ? new Date(shift.endAt)
      : null;

  const totalMs =
    end
      ? Math.max(
          0,
          end.getTime() -
          start.getTime()
        )
      : Math.max(
          0,
          Date.now() -
          start.getTime()
        );

  const normalLimit =
    Number(
      state.settings.normalHours || 8
    ) *
    60 *
    60 *
    1000;

  const overtime =
    state.settings.allowOvertime !== false
      ? Math.max(
          0,
          totalMs - normalLimit
        )
      : 0;

  const hasOT =
    overtime > 0;

  return `

    <div class="home-recent-item">

      <div class="home-recent-state ${
        end
          ? hasOT
            ? "overtime"
            : "done"
          : "active"
      }">

        ${
          end
            ? hasOT
              ? "■"
              : "✓"
            : "▶"
        }

      </div>


      <div class="home-recent-info">

        <strong>

          ${
            end
              ? hasOT
                ? "ออกเวร (OT)"
                : "ออกเวร"
              : "กำลังเข้าเวร"
          }

        </strong>

        <span>

          ${start.toLocaleDateString(
            "th-TH",
            {
              day: "numeric",
              month: "short",
              year: "numeric"
            }
          )}

          ${start.toLocaleTimeString(
            "th-TH",
            {
              hour: "2-digit",
              minute: "2-digit"
            }
          )}

        </span>

      </div>


      <div class="home-recent-duration">

        <span>
          เวลาทำงาน
        </span>

        <strong>
          ${formatWorkHours(
            totalMs / 3600000
          )}
        </strong>

      </div>

    </div>

  `;

}


function getDashboardChartData(shifts, range = "7") {
  shifts = Array.isArray(shifts) ? shifts : [];

  let startDate = new Date();
  let endDate = new Date();

  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

  if (range === "thisMonth") {
    startDate = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      1
    );
  } else if (range === "lastMonth") {
    startDate = new Date(
      endDate.getFullYear(),
      endDate.getMonth() - 1,
      1
    );

    endDate = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      0,
      23,
      59,
      59,
      999
    );
  } else {
    const days = Number(range) || 7;

    startDate.setDate(
      startDate.getDate() - (days - 1)
    );
  }

  const data = [];
  const cursor = new Date(startDate);

  const normalLimit =
    Number(state.settings?.normalHours || 8) *
    60 *
    60 *
    1000;

  while (cursor <= endDate) {
    const dayStart = new Date(cursor);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    let normalMs = 0;
    let overtimeMs = 0;

    for (const shift of shifts) {
      if (!shift?.startAt) continue;

      const shiftStart = new Date(shift.startAt);

      const shiftEnd = shift.endAt
        ? new Date(shift.endAt)
        : new Date();

      const effectiveStart = new Date(
        Math.max(
          shiftStart.getTime(),
          dayStart.getTime()
        )
      );

      const effectiveEnd = new Date(
        Math.min(
          shiftEnd.getTime(),
          dayEnd.getTime()
        )
      );

      if (effectiveEnd <= effectiveStart) {
        continue;
      }

      const normalEnd = new Date(
        shiftStart.getTime() + normalLimit
      );

      const normalStartMs =
        effectiveStart.getTime();

      const normalEndMs = Math.min(
        effectiveEnd.getTime(),
        normalEnd.getTime()
      );

      if (normalEndMs > normalStartMs) {
        normalMs +=
          normalEndMs - normalStartMs;
      }

      if (state.settings?.allowOvertime !== false) {
        const otStartMs = Math.max(
          effectiveStart.getTime(),
          normalEnd.getTime()
        );

        if (effectiveEnd.getTime() > otStartMs) {
          overtimeMs +=
            effectiveEnd.getTime() - otStartMs;
        }
      }
    }

    data.push({
      date: new Date(dayStart),
      normalHours: normalMs / 3600000,
      overtimeHours: overtimeMs / 3600000
    });

    cursor.setDate(cursor.getDate() + 1);
  }

  return data;
}
function changeHomeChartRange(range) {
  dashboardChartRange = range;

  const chart =
    document.querySelector("#homeDutyChart");

  if (!chart) {
    return;
  }

  const data = getDashboardChartData(
    dashboardChartShifts,
    dashboardChartRange
  );

  chart.innerHTML =
    dashboardHomeChartHTML(data);

  const description =
    document.querySelector(
      "#homeChartDescription"
    );

  if (description) {
    const labels = {
      "7": "ภาพรวมเวลาปฏิบัติงานย้อนหลัง 7 วัน",
      "14": "ภาพรวมเวลาปฏิบัติงานย้อนหลัง 14 วัน",
      "30": "ภาพรวมเวลาปฏิบัติงานย้อนหลัง 30 วัน",
      "thisMonth": "ภาพรวมเวลาปฏิบัติงานของเดือนนี้",
      "lastMonth": "ภาพรวมเวลาปฏิบัติงานของเดือนที่แล้ว"
    };

    description.textContent =
      labels[dashboardChartRange] ||
      "ภาพรวมเวลาปฏิบัติงาน";
  }
}

function dashboardHomeChartHTML(data) {
  if (!Array.isArray(data) || !data.length) {
    return `
      <div class="home-chart-empty">
        ยังไม่มีข้อมูลสำหรับช่วงเวลานี้
      </div>
    `;
  }

  const maximum = Math.max(
    8,
    ...data.map(
      item =>
        Number(item.normalHours || 0) +
        Number(item.overtimeHours || 0)
    )
  );

  /*
   * กำหนดความกว้างต่อวัน
   * 7 วัน  = เต็มพื้นที่
   * 14 วัน = กว้างขึ้นเล็กน้อย
   * 30/31 วัน = scroll แนวนอน
   */
  let columnWidth = 80;

  if (data.length > 7 && data.length <= 14) {
    columnWidth = 60;
  }

  if (data.length > 14) {
    columnWidth = 46;
  }

  const minimumWidth =
    data.length * columnWidth;

  /*
   * จำนวนวันที่จะแสดง label
   * ป้องกันข้อความวันที่ชนกัน
   */
  let labelEvery = 1;

  if (data.length > 7 && data.length <= 14) {
    labelEvery = 2;
  }

  if (data.length > 14) {
    labelEvery = 5;
  }

  return `
    <div class="home-chart-scroll">

      <div
        class="home-chart"
        style="
          --chart-count: ${data.length};
          --chart-min-width: ${minimumWidth}px;
        "
      >

        <div class="home-chart-lines">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>

        <div class="home-chart-columns">

          ${data.map((item, index) => {
            const normalHours =
              Number(item.normalHours || 0);

            const overtimeHours =
              Number(item.overtimeHours || 0);

            const normalHeight = Math.max(
              0,
              Math.min(
                100,
                (normalHours / maximum) * 100
              )
            );

            const otHeight = Math.max(
              0,
              Math.min(
                100,
                (overtimeHours / maximum) * 100
              )
            );

            const showLabel =
              index % labelEvery === 0 ||
              index === data.length - 1;

            const dateLabel =
              item.date.toLocaleDateString(
                "th-TH",
                {
                  day: "numeric",
                  month: "short"
                }
              );

            return `
              <div class="home-chart-column">

                <div class="home-bars">

                  <div
                    class="home-bar normal"
                    style="height:${normalHeight}%"
                    title="เวลาปกติ ${normalHours.toFixed(1)} ชั่วโมง"
                  ></div>

                  <div
                    class="home-bar ot"
                    style="height:${otHeight}%"
                    title="OT ${overtimeHours.toFixed(1)} ชั่วโมง"
                  ></div>

                </div>

                <span
                  class="home-chart-date ${
                    showLabel
                      ? ""
                      : "is-hidden"
                  }"
                >
                  ${
                    showLabel
                      ? dateLabel
                      : "&nbsp;"
                  }
                </span>

              </div>
            `;
          }).join("")}

        </div>

      </div>

    </div>
  `;
}

/* ==========================================
   DASHBOARD HELPERS
========================================== */

function getTodaySummary(shifts) {

  const now = new Date();

  const startOfDay =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

  const endOfDay =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    );

  let totalMs = 0;
  let overtimeMs = 0;
  let count = 0;

  const normalLimit =
    Number(
      state.settings.normalHours || 8
    ) *
    60 *
    60 *
    1000;


  for (const shift of shifts) {

    if (!shift.startAt) {
      continue;
    }

    const start =
      new Date(shift.startAt);

    if (
      start < startOfDay ||
      start >= endOfDay
    ) {
      continue;
    }

    count++;


    const end =
      shift.endAt
        ? new Date(shift.endAt)
        : new Date();


    const duration =
      Math.max(
        0,
        end.getTime() -
        start.getTime()
      );


    totalMs += duration;


    if (
      state.settings.allowOvertime !== false
    ) {

      overtimeMs +=
        Math.max(
          0,
          duration - normalLimit
        );

    }

  }


  /*
    activeShift อาจไม่อยู่ใน /api/history
    ถ้าไม่มีอยู่ ให้รวมเวรปัจจุบันด้วย
  */

  if (state.activeShift?.startAt) {

    const activeStart =
      new Date(
        state.activeShift.startAt
      );

    const exists =
      shifts.some(
        item =>
          item.id ===
          state.activeShift.id
      );


    if (
      !exists &&
      activeStart >= startOfDay &&
      activeStart < endOfDay
    ) {

      const duration =
        Math.max(
          0,
          Date.now() -
          activeStart.getTime()
        );


      totalMs += duration;

      count++;


      if (
        state.settings.allowOvertime !== false
      ) {

        overtimeMs +=
          Math.max(
            0,
            duration - normalLimit
          );

      }

    }

  }


  return {

    totalHours:
      totalMs /
      3600000,

    overtimeHours:
      overtimeMs /
      3600000,

    shifts:
      count

  };

}


function getLatestCompletedShift(shifts) {

  return shifts
    .filter(
      shift =>
        shift.startAt &&
        shift.endAt
    )
    .sort(
      (a, b) =>
        new Date(b.startAt) -
        new Date(a.startAt)
    )[0] || null;

}


function formatWorkHours(value) {

  const totalMinutes =
    Math.floor(
      Number(value || 0) * 60
    );

  const h =
    Math.floor(
      totalMinutes / 60
    );

  const m =
    totalMinutes % 60;


  if (h <= 0) {
    return `${m} นาที`;
  }


  return `${h} ชม. ${m} นาที`;

}


function latestShiftHTML(shift) {

  const start =
    new Date(shift.startAt);

  const end =
    new Date(shift.endAt);


  const totalMs =
    Math.max(
      0,
      end.getTime() -
      start.getTime()
    );


  const normalLimit =
    Number(
      state.settings.normalHours || 8
    ) *
    60 *
    60 *
    1000;


  const normalMs =
    Math.min(
      totalMs,
      normalLimit
    );


  const overtimeMs =
    state.settings.allowOvertime !== false
      ? Math.max(
          0,
          totalMs - normalLimit
        )
      : 0;


  return `

    <div class="latest-shift-content">

      <div class="latest-date">

        <span>
          วันที่
        </span>

        <strong>
          ${start.toLocaleDateString(
            "th-TH",
            {
              day: "numeric",
              month: "short",
              year: "numeric"
            }
          )}
        </strong>

      </div>


      <div class="latest-time-row">

        <div>

          <span>
            เข้าเวร
          </span>

          <strong>
            ${start.toLocaleTimeString(
              "th-TH",
              {
                hour: "2-digit",
                minute: "2-digit"
              }
            )}
          </strong>

        </div>


        <div class="time-arrow">
          →
        </div>


        <div>

          <span>
            ออกเวร
          </span>

          <strong>
            ${end.toLocaleTimeString(
              "th-TH",
              {
                hour: "2-digit",
                minute: "2-digit"
              }
            )}
          </strong>

        </div>

      </div>


      <div class="latest-summary">

        <div>
          <span>เวลาปกติ</span>

          <strong>
            ${formatWorkHours(
              normalMs / 3600000
            )}
          </strong>
        </div>


        <div>
          <span>OT</span>

          <strong class="summary-ot">
            ${formatWorkHours(
              overtimeMs / 3600000
            )}
          </strong>
        </div>


        <div>
          <span>เวลารวม</span>

          <strong>
            ${formatWorkHours(
              totalMs / 3600000
            )}
          </strong>
        </div>

      </div>

    </div>

  `;

}


function activeHTML(shift) {

  return `

    <p>
      เข้าเวรเมื่อ

      <strong>
        ${dt(shift.startAt)}
      </strong>
    </p>

    <div class="time-grid">

      <div
        class="time-box normal"
      >

        <span>
          เวลาปกติ
        </span>

        <strong id="normalTime">
          00:00:00
        </strong>

        <small>
          สูงสุด
          ${state.settings.normalHours}
          ชั่วโมง
        </small>

      </div>

      <div
        class="time-box ot"
      >

        <span>
          OT
        </span>

        <strong id="otTime">
          00:00:00
        </strong>

        <small>
          เวลาที่เกิน
          ${state.settings.normalHours}
          ชั่วโมง
        </small>

      </div>

    </div>

    <button
      class="red"
      onclick="endShift()"
    >
      🔴 ออกเวร
    </button>

  `;

}


function updateTimer() {

  if (!state.activeShift) {
    return;
  }

  const total =
    Date.now() -
    new Date(
      state.activeShift.startAt
    ).getTime();

  const normalLimit =
    Number(
      state.settings.normalHours
    ) *
    60 *
    60 *
    1000;

  const normal =
    Math.min(
      total,
      normalLimit
    );

  const overtime =
    Math.max(
      0,
      total - normalLimit
    );

  const normalElement =
    $("#normalTime");

  const overtimeElement =
    $("#otTime");

  if (normalElement) {
    normalElement.textContent =
      dur(normal);
  }

  if (overtimeElement) {
    overtimeElement.textContent =
      dur(overtime);
  }

}


// =============================
// CONFIRM MODAL
// =============================

function beautifulConfirm({
  title = "ยืนยันการทำรายการ",
  message =
    "คุณต้องการดำเนินการต่อหรือไม่?",
  type = "start",
  confirmText = "ยืนยัน"
}) {

  return new Promise(
    resolve => {

      const overlay =
        $("#confirmModal");

      const modal =
        overlay.querySelector(
          ".confirm-modal"
        );

      const icon =
        $("#confirmIcon");

      const titleElement =
        $("#confirmTitle");

      const messageElement =
        $("#confirmMessage");

      const cancel =
        $("#confirmCancel");

      const accept =
        $("#confirmAccept");

      titleElement.textContent =
        title;

      messageElement.textContent =
        message;

      accept.textContent =
        confirmText;

      modal.classList.toggle(
        "end-mode",
        type === "end"
      );

      icon.textContent =
        type === "end"
          ? "!"
          : "✓";

      overlay.classList.add(
        "show"
      );

      document.body.style
        .overflow = "hidden";

      let finished = false;


      function close(result) {

        if (finished) {
          return;
        }

        finished = true;

        overlay.classList.remove(
          "show"
        );

        document.body.style
          .overflow = "";

        cancel.onclick = null;
        accept.onclick = null;
        overlay.onclick = null;
        document.onkeydown = null;

        setTimeout(
          () => resolve(result),
          120
        );

      }


      cancel.onclick =
        () => close(false);


      accept.onclick =
        () => close(true);


      overlay.onclick =
        event => {

          if (
            event.target ===
            overlay
          ) {

            close(false);

          }

        };


      document.onkeydown =
        event => {

          if (
            event.key ===
            "Escape"
          ) {

            close(false);

          }

          if (
            event.key ===
            "Enter"
          ) {

            close(true);

          }

        };

    }
  );

}


// =============================
// SHIFT
// =============================

async function startShift() {

  const confirmed =
    await beautifulConfirm({
      title:
        "ยืนยันการเข้าเวร",

      message:
        "ระบบจะเริ่มนับเวลาปฏิบัติงานของคุณทันที",

      confirmText:
        "เข้าเวร"
    });

  if (!confirmed) {
    return;
  }

  try {

    await api(
      "/api/shifts/start",
      {
        method: "POST"
      }
    );

    await load();

  } catch (error) {

    alert(error.message);

  }

}


async function endShift() {

  const confirmed =
    await beautifulConfirm({
      title:
        "ยืนยันการออกเวร",

      message:
        "ระบบจะหยุดนับเวลาและบันทึกเวลาปฏิบัติงานของคุณ",

      type:
        "end",

      confirmText:
        "ออกเวร"
    });

  if (!confirmed) {
    return;
  }

  try {

    await api(
      "/api/shifts/end",
      {
        method: "POST"
      }
    );

    await load();

  } catch (error) {

    alert(error.message);

  }

}


// =============================
// LOGOUT
// =============================

async function logout() {

  await api(
    "/api/logout",
    {
      method: "POST"
    }
  );

  location.reload();

}


// =============================
// HISTORY
// =============================

async function showHistory() {

  clearInterval(timer);

  const shifts =
    await api("/api/history");

  $("#app").innerHTML = `

    ${nav("history")}

    <div class="card">

      <div class="card-title-row">

        <div>

          <h2 style="margin-bottom: 3px;">
            ประวัติการเข้าเวร
          </h2>

          <p
            class="muted"
            style="margin: 0;"
          >
            รายการเข้าเวรและออกเวรของคุณ
          </p>

        </div>


        ${
          state.user.isAdmin && shifts.length
            ? `

              <button
                class="red compact"
                onclick="toggleHistoryDelete()"
              >
                ลบข้อมูล
              </button>

            `
            : ""
        }

      </div>


      ${
        state.user.isAdmin
          ? `

            <div
              id="historyDeletePanel"
              class="history-delete-panel hidden"
            >

              <div class="history-delete-info">

                <strong>
                  จัดการประวัติ
                </strong>

                <span>
                  เลือกรายการที่ต้องการลบ
                  หรือลบประวัติทั้งหมด
                </span>

              </div>


              <div class="history-delete-actions">

                <select id="historyDeleteSelect">

                  <option value="">
                    เลือกรายการ
                  </option>

                  ${
                    shifts
                      .filter(
                        shift =>
                          shift.endAt
                      )
                      .map(
                        shift => `

                          <option
                            value="${esc(
                              shift.id
                            )}"
                          >
                            ${esc(
                              new Date(
                                shift.startAt
                              ).toLocaleString(
                                "th-TH"
                              )
                            )}
                          </option>

                        `
                      )
                      .join("")
                  }

                </select>


                <button
                  class="red compact"
                  onclick="deleteHistoryItem()"
                >
                  ลบรายการ
                </button>


                <button
                  class="danger-outline compact"
                  onclick="deleteAllHistory()"
                >
                  ลบประวัติทั้งหมด
                </button>

              </div>

            </div>

          `
          : ""
      }


      <div class="scroll">

        <table>

          <thead>

            <tr>
              <th>เข้าเวร</th>
              <th>ออกเวร</th>
              <th>สถานะ</th>
            </tr>

          </thead>


          <tbody>

            ${
              shifts.length
                ? shifts
                    .map(
                      shift => `

                        <tr>

                          <td>
                            ${dt(
                              shift.startAt
                            )}
                          </td>

                          <td>
                            ${dt(
                              shift.endAt
                            )}
                          </td>

                          <td>

                            ${
                              shift.endAt
                                ? `
                                  <span class="history-status done">
                                    เสร็จสิ้น
                                  </span>
                                `
                                : `
                                  <span class="history-status active">
                                    กำลังเข้าเวร
                                  </span>
                                `
                            }

                          </td>

                        </tr>

                      `
                    )
                    .join("")
                : `

                  <tr>

                    <td
                      colspan="3"
                      class="history-empty"
                    >
                      ยังไม่มีประวัติการเข้าเวร
                    </td>

                  </tr>

                `
            }

          </tbody>

        </table>

      </div>

    </div>

  `;

}
function toggleHistoryDelete() {

  if (!state.user?.isAdmin) {
    return;
  }

  const panel =
    $("#historyDeletePanel");

  if (!panel) {
    return;
  }

  panel.classList.toggle("hidden");

}


async function deleteHistoryItem() {

  if (!state.user?.isAdmin) {
    return;
  }

  const select =
    $("#historyDeleteSelect");

  const id =
    select?.value;

  if (!id) {

    alert(
      "กรุณาเลือกรายการที่ต้องการลบ"
    );

    return;
  }


  const confirmed =
    await beautifulConfirm({

      title:
        "ลบประวัติการเข้าเวร",

      message:
        "คุณต้องการลบประวัติรายการนี้หรือไม่? เมื่อลบแล้วจะไม่สามารถกู้คืนได้",

      type:
        "end",

      confirmText:
        "ลบรายการ"

    });


  if (!confirmed) {
    return;
  }


  try {

    await api(
      `/api/history/${encodeURIComponent(id)}`,
      {
        method: "DELETE"
      }
    );

    await showHistory();

  } catch (error) {

    console.error(
      "DELETE HISTORY:",
      error
    );

    alert(
      error.message ||
      "ไม่สามารถลบรายการได้"
    );

  }

}


async function deleteAllHistory() {

  if (!state.user?.isAdmin) {
    return;
  }


  const confirmed =
    await beautifulConfirm({

      title:
        "ลบประวัติทั้งหมด",

      message:
        "ประวัติการเข้าเวรที่เสร็จสิ้นแล้วทั้งหมดของคุณจะถูกลบ และไม่สามารถกู้คืนได้",

      type:
        "end",

      confirmText:
        "ลบทั้งหมด"

    });


  if (!confirmed) {
    return;
  }


  try {

    const result =
      await api(
        "/api/history",
        {
          method: "DELETE"
        }
      );


    await showHistory();


    if (
      result?.deleted === 0
    ) {

      alert(
        "ไม่มีประวัติที่สามารถลบได้"
      );

    }

  } catch (error) {

    console.error(
      "DELETE ALL HISTORY:",
      error
    );

    alert(
      error.message ||
      "ไม่สามารถลบประวัติทั้งหมดได้"
    );

  }

}

// =============================
// MY PROFILE
// =============================

async function showMyProfile() {

  clearInterval(timer);

  const profile =
    await api(
      "/api/profile"
    );

  const user =
    profile.user;

  $("#app")
    .innerHTML = `

      ${nav("profile")}

      <div class="profile-layout">

        <div
          class="card profile-card"
        >

          <div
            class="profile-avatar-wrap"
          >

            ${
              avatar(user)
                ? `

                  <img
                    class="profile-avatar"
                    src="${esc(
                      avatar(user)
                    )}"
                  >

                `
                : `

                  <div
                    class="profile-avatar placeholder"
                  >
                    ?
                  </div>

                `
            }

          </div>

          <h2>
            ${esc(
              user.displayName ||
              user.username
            )}
          </h2>

          ${levelBadge(user)}

          <p class="muted">
            Discord:
            ${esc(
              user.discordUsername ||
              user.username
            )}
          </p>

          <div
            class="profile-actions"
          >

            <label
              class="button blue"
            >

              เปลี่ยนรูป

              <input
                id="avatarInput"
                type="file"
                accept="
                  image/png,
                  image/jpeg,
                  image/webp
                "
                hidden
                onchange="uploadAvatar(this)"
              >

            </label>

            <button
              class="gray"
              onclick="resetAvatar()"
            >
              ใช้รูป Discord
            </button>

          </div>

        </div>


        <div>

          <div class="stat-grid">

            <div class="stat-card">

              <span>
                เข้าเวรทั้งหมด
              </span>

              <strong>
                ${profile.stats.shifts}
              </strong>

            </div>

            <div class="stat-card">

              <span>
                เวลารวม
              </span>

              <strong>
                ${hours(
                  profile.stats.totalHours
                )}
              </strong>

            </div>

            <div class="stat-card">

              <span>
                OT รวม
              </span>

              <strong>
                ${hours(
                  profile.stats
                    .overtimeHours
                )}
              </strong>

            </div>

          </div>


          <div class="card">

  <h3>
    แก้ไขโปรไฟล์
  </h3>

  ${
    user.displayNameChanged === true
      ? `

        <div class="profile-name-locked">

          <strong>
            ชื่อแสดงผลถูกล็อกแล้ว
          </strong>

          <p class="muted">
            คุณใช้สิทธิ์เปลี่ยนชื่อด้วยตัวเองแล้ว
            หากต้องการเปลี่ยนอีกครั้ง กรุณาติดต่อ Head Admin
          </p>

        </div>

      `
      : `

        <div class="profile-name-notice">

          <strong>
            เปลี่ยนชื่อได้ 1 ครั้ง
          </strong>

          <p class="muted">
            คุณสามารถเปลี่ยนชื่อแสดงผลด้วยตัวเองได้อีก 1 ครั้ง
            หลังจากบันทึกแล้ว การเปลี่ยนชื่อครั้งต่อไปต้องดำเนินการโดย Head Admin
          </p>

        </div>

      `
  }


  <label class="field">

    ชื่อแสดงผล

    <input
      id="displayName"
      maxlength="50"
      value="${esc(
        user.displayName ||
        user.username
      )}"
      ${
        user.displayNameChanged === true
          ? "disabled"
          : ""
      }
    >

  </label>


  ${
    user.displayNameChanged !== true
      ? `

        <br>

        <button
          onclick="saveProfile()"
        >
          บันทึกชื่อ
        </button>

      `
      : ""
  }

</div>

        </div>

      </div>

    `;

}


async function saveProfile() {

  const input =
    $("#displayName");

  if (!input) {
    return;
  }

  const displayName =
    input.value.trim();

  if (!displayName) {

    alert(
      "กรุณากรอกชื่อแสดงผล"
    );

    return;
  }


  const confirmed =
    await beautifulConfirm({

      title:
        "ยืนยันการเปลี่ยนชื่อ",

      message:
        "คุณสามารถเปลี่ยนชื่อด้วยตัวเองได้เพียง 1 ครั้ง หลังจากบันทึกแล้ว หากต้องการเปลี่ยนอีกครั้งจะต้องติดต่อ Head Admin",

      confirmText:
        "ยืนยันเปลี่ยนชื่อ"

    });


  if (!confirmed) {
    return;
  }


  try {

    await api(
      "/api/profile",
      {
        method: "PATCH",

        body:
          JSON.stringify({
            displayName
          })
      }
    );


    /*
      โหลดข้อมูลใหม่
      เพื่อให้ชื่อบน Header เปลี่ยนทันที
    */

    state =
      await api("/api/me");

    showHeader();

    await showMyProfile();


  } catch (error) {

    console.error(
      "SAVE PROFILE:",
      error
    );

    alert(
      error.message ||
      "ไม่สามารถเปลี่ยนชื่อได้"
    );

  }

}


async function uploadAvatar(
  input
) {

  const file =
    input.files?.[0];

  if (!file) {
    return;
  }

  const allowed = [
    "image/png",
    "image/jpeg",
    "image/webp"
  ];

  if (
    !allowed.includes(
      file.type
    )
  ) {

    alert(
      "รองรับเฉพาะ JPG, PNG และ WebP"
    );

    return;

  }

  if (
    file.size >
    5 * 1024 * 1024
  ) {

    alert(
      "รูปต้องมีขนาดไม่เกิน 5 MB"
    );

    return;

  }

  const form =
    new FormData();

  form.append(
    "avatar",
    file
  );

  try {

    await api(
      "/api/profile/avatar",
      {
        method: "POST",
        body: form
      }
    );

    await load();

    await showMyProfile();

  } catch (error) {

    alert(error.message);

  }

}


async function resetAvatar() {

  try {

    await api(
      "/api/profile/avatar",
      {
        method: "DELETE"
      }
    );

    await load();

    await showMyProfile();

  } catch (error) {

    alert(error.message);

  }

}
// =============================
// LEAVE REQUESTS
// =============================

function leaveStatusBadge(status) {

  const map = {
    pending: ["pending", "⏳ รออนุมัติ"],
    approved: ["approved", "✓ อนุมัติแล้ว"],
    rejected: ["rejected", "✕ ไม่อนุมัติ"]
  };

  const item =
    map[status] || map.pending;

  return `
    <span class="leave-status ${item[0]}">
      ${item[1]}
    </span>
  `;
}


function leaveTypeLabel(type) {

  const labels = {
    sick: "ลาป่วย",
    personal: "ลากิจ",
    vacation: "ลาพักร้อน",
    other: "อื่น ๆ"
  };

  return labels[type] || type || "-";
}


function leaveDate(value) {

  if (!value) {
    return "-";
  }

  const date =
    new Date(`${value}T00:00:00`);

  return date.toLocaleDateString(
    "th-TH",
    {
      day: "numeric",
      month: "short",
      year: "numeric"
    }
  );
}


async function showLeave() {

  clearInterval(timer);

  let leaves = [];

  try {

    leaves =
      await api("/api/leaves");

  } catch (error) {

    alert(error.message);

  }


  $("#app").innerHTML = `

    ${nav("leave")}

    <div class="leave-layout">

      <section class="card">

        <div class="card-title-row">

          <div>
            <h2>ขอลางาน</h2>

            <p class="muted">
              กรอกรายละเอียดเพื่อส่งให้
              Head Admin พิจารณา
            </p>
          </div>

        </div>


        <form
          class="leave-form"
          onsubmit="submitLeave(event)"
        >

          <label class="field">

            ประเภทการลา

            <select
              id="leaveType"
              required
            >
              <option value="sick">
                ลาป่วย
              </option>

              <option value="personal">
                ลากิจ
              </option>

              <option value="vacation">
                ลาพักร้อน
              </option>

              <option value="other">
                อื่น ๆ
              </option>
            </select>

          </label>


          <div class="leave-date-grid">

            <label class="field">

              วันที่เริ่ม

              <input
                id="leaveStartDate"
                type="date"
                required
              >

            </label>


            <label class="field">

              วันที่สิ้นสุด

              <input
                id="leaveEndDate"
                type="date"
                required
              >

            </label>

          </div>


          <label class="field">

            เหตุผล

            <textarea
              id="leaveReason"
              rows="5"
              maxlength="500"
              placeholder="ระบุเหตุผลการลา..."
              required
            ></textarea>

          </label>


          <button
            class="blue"
            type="submit"
          >
            ส่งคำขอลา
          </button>

        </form>

      </section>


      <section class="card">

        <div class="card-title-row">

          <div>
            <h2>
              ประวัติการลาของฉัน
            </h2>

            <p class="muted">
              ตรวจสอบสถานะคำขอลางานย้อนหลัง
            </p>
          </div>

        </div>


        <div class="leave-list">

          ${
            leaves.length

              ? leaves.map(
                  leave => `

                    <article class="leave-item">

                      <div class="leave-item-top">

                        <strong>
                          ${
                            esc(
                              leaveTypeLabel(
                                leave.type
                              )
                            )
                          }
                        </strong>

                        ${
                          leaveStatusBadge(
                            leave.status
                          )
                        }

                      </div>


                      <div class="leave-period">

                        ${
                          leaveDate(
                            leave.startDate
                          )
                        }

                        –

                        ${
                          leaveDate(
                            leave.endDate
                          )
                        }

                      </div>


                      <p>
                        ${
                          esc(
                            leave.reason
                          )
                        }
                      </p>


                      ${
                        leave.adminNote

                          ? `
                            <div class="leave-admin-note">

                              <strong>
                                หมายเหตุจาก Head Admin:
                              </strong>

                              ${
                                esc(
                                  leave.adminNote
                                )
                              }

                            </div>
                          `

                          : ""
                      }


                      <small class="muted">

                        ยื่นเมื่อ
                        ${
                          dt(
                            leave.createdAt
                          )
                        }

                      </small>

                    </article>

                  `
                ).join("")

              : `
                <div class="leave-empty">
                  ยังไม่มีประวัติการลา
                </div>
              `
          }

        </div>

      </section>

    </div>

  `;


  const today =
    new Date()
      .toISOString()
      .slice(0, 10);


  const start =
    $("#leaveStartDate");

  const end =
    $("#leaveEndDate");


  if (start) {
    start.min = today;
  }

  if (end) {
    end.min = today;
  }
}


async function submitLeave(event) {

  event.preventDefault();


  const startDate =
    $("#leaveStartDate").value;

  const endDate =
    $("#leaveEndDate").value;


  if (endDate < startDate) {

    alert(
      "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม"
    );

    return;
  }


  try {

    await api(
      "/api/leaves",
      {
        method: "POST",

        body: JSON.stringify({
          type:
            $("#leaveType").value,

          startDate,

          endDate,

          reason:
            $("#leaveReason")
              .value
              .trim()
        })
      }
    );


    alert(
      "ส่งคำขอลางานเรียบร้อยแล้ว"
    );


    await showLeave();


  } catch (error) {

    alert(error.message);

  }
}

// =============================
// HEAD ADMIN
// =============================

async function showAdmin(
  tab = "dashboard"
) {

  clearInterval(timer);

  adminData =
    await api(
      "/api/admin/overview"
    );

  const tabs = `

    <div class="admin-subtabs">

      <button
        class="${
          tab === "dashboard"
            ? "active"
            : ""
        }"
        onclick="
          showAdmin('dashboard')
        "
      >
        📊 Dashboard
      </button>

      <button
        class="${
          tab === "active"
            ? "active"
            : ""
        }"
        onclick="
          showAdmin('active')
        "
      >
        🟢 เวรปัจจุบัน
      </button>

      <button
        class="${
          tab === "users"
            ? "active"
            : ""
        }"
        onclick="
          showAdmin('users')
        "
      >
        👥 บุคลากร
      </button>

      <button
        class="${
          tab === "shifts"
            ? "active"
            : ""
        }"
        onclick="
          showAdmin('shifts')
        "
      >
        🕐 ประวัติเวร
      </button>

      <button
        class="${
          tab === "settings"
            ? "active"
            : ""
        }"
        onclick="
          showAdmin('settings')
        "
      >
      
        ⚙️ ตั้งค่า
      </button>
      <button
        class="${
          tab === "leaves"
            ? "active"
            : ""
        }"
        onclick="
          showAdmin('leaves')
        "
      >
        📝 การลางาน
      </button>
      <button
        class="${
          tab === "audit"
            ? "active"
            : ""
        }"
        onclick="
          showAdmin('audit')
        "
      >
        📋 Audit
      </button>

    </div>

  `;

  $("#app")
    .innerHTML = `

      ${nav("admin")}

      ${tabs}

      <div id="adminBody">
      </div>

    `;

  const pages = {

    dashboard:
      adminDashboard,

    active:
      adminActive,

    users:
      adminUsers,

    shifts:
      adminShifts,

    settings:
      adminSettings,

    audit:
      adminAudit,
    leaves:
      adminLeaves,
  };

  (
    pages[tab] ||
    adminDashboard
  )();

}


// =============================
// ADMIN DASHBOARD
// =============================

// =============================
// ADMIN DASHBOARD
// =============================

function adminDashboard() {

  $("#adminBody").innerHTML = `

    <div class="card admin-dashboard-header">

      <div class="card-title-row">

        <div>
          <h2 style="margin-bottom: 4px;">
            ภาพรวมการปฏิบัติงาน
          </h2>

          <p class="muted" style="margin: 0;">
            สรุปเวลาปฏิบัติงานของบุคลากรในระบบ
          </p>
        </div>


        <div class="dashboard-filter-group">

          <select
            id="dashboardRange"
            onchange="changeDashboardRange()"
          >

            <option value="today">
              วันนี้
            </option>

            <option value="week" selected>
              สัปดาห์นี้
            </option>

            <option value="month">
              เดือนนี้
            </option>

          </select>


          <select
            id="dashboardMonth"
            class="hidden"
            onchange="renderAdminDashboardStats()"
          >
          </select>

        </div>

      </div>

    </div>


    <div id="dashboardStats"></div>

  `;


  buildDashboardMonthOptions();

  renderAdminDashboardStats();

}


// =============================
// DASHBOARD RANGE
// =============================

function changeDashboardRange() {

  const range =
    $("#dashboardRange")?.value ||
    "week";

  const monthSelect =
    $("#dashboardMonth");


  if (monthSelect) {

    monthSelect.classList.toggle(
      "hidden",
      range !== "month"
    );

  }


  renderAdminDashboardStats();

}


// =============================
// MONTH OPTIONS
// =============================

function buildDashboardMonthOptions() {

  const select =
    $("#dashboardMonth");

  if (!select) {
    return;
  }


  const now =
    new Date();

  const options = [];


  for (let i = 0; i < 12; i++) {

    const date =
      new Date(
        now.getFullYear(),
        now.getMonth() - i,
        1
      );


    const value =
      `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;


    const label =
      date.toLocaleDateString(
        "th-TH",
        {
          month: "long",
          year: "numeric"
        }
      );


    options.push(`

      <option value="${value}">
        ${label}
      </option>

    `);

  }


  select.innerHTML =
    options.join("");

}


// =============================
// DATE RANGE
// =============================

function getDashboardDateRange() {

  const type =
    $("#dashboardRange")?.value ||
    "week";

  const now =
    new Date();


  let start;
  let end;
  let title;


  // -----------------------------
  // TODAY
  // -----------------------------

  if (type === "today") {

    start =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );


    end =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1
      );


    title =
      now.toLocaleDateString(
        "th-TH",
        {
          day: "numeric",
          month: "long",
          year: "numeric"
        }
      );

  }


  // -----------------------------
  // WEEK
  // -----------------------------

  else if (type === "week") {

    const day =
      now.getDay();

    const mondayOffset =
      day === 0
        ? -6
        : 1 - day;


    start =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + mondayOffset
      );


    start.setHours(
      0,
      0,
      0,
      0
    );


    end =
      new Date(start);

    end.setDate(
      end.getDate() + 7
    );


    title =
      `${start.toLocaleDateString(
        "th-TH",
        {
          day: "numeric",
          month: "short"
        }
      )} - ${
        new Date(
          end.getTime() - 1
        ).toLocaleDateString(
          "th-TH",
          {
            day: "numeric",
            month: "short",
            year: "numeric"
          }
        )
      }`;

  }


  // -----------------------------
  // MONTH
  // -----------------------------

  else {

    const value =
      $("#dashboardMonth")?.value;


    let year =
      now.getFullYear();

    let month =
      now.getMonth();


    if (value) {

      const parts =
        value.split("-");

      year =
        Number(parts[0]);

      month =
        Number(parts[1]) - 1;

    }


    start =
      new Date(
        year,
        month,
        1
      );


    end =
      new Date(
        year,
        month + 1,
        1
      );


    title =
      start.toLocaleDateString(
        "th-TH",
        {
          month: "long",
          year: "numeric"
        }
      );

  }


  return {
    type,
    start,
    end,
    title
  };

}


// =============================
// SHIFT USER ID
// =============================

function getDashboardShiftUserId(
  shift
) {

  return String(
    shift.discordId ??
    shift.userId ??
    shift.discordUserId ??
    shift.user?.discordId ??
    ""
  );

}


// =============================
// SHIFT USER NAME
// =============================

function getDashboardShiftName(
  shift
) {

  const userId =
    getDashboardShiftUserId(
      shift
    );


  const user =
    adminData.users.find(
      item =>
        String(item.discordId) ===
        userId
    );


  return (
    user?.displayName ||
    user?.username ||
    shift.displayName ||
    shift.username ||
    "ไม่ทราบชื่อ"
  );

}


// =============================
// SHIFT DURATION
// =============================

function getDashboardShiftDuration(
  shift,
  rangeStart,
  rangeEnd
) {

  if (!shift?.startAt) {

    return {
      totalMs: 0,
      normalMs: 0,
      overtimeMs: 0
    };

  }


  const originalStart =
    new Date(
      shift.startAt
    );


  const originalEnd =
    shift.endAt
      ? new Date(
          shift.endAt
        )
      : new Date();


  if (
    Number.isNaN(
      originalStart.getTime()
    ) ||
    Number.isNaN(
      originalEnd.getTime()
    )
  ) {

    return {
      totalMs: 0,
      normalMs: 0,
      overtimeMs: 0
    };

  }


  if (
    originalEnd <= rangeStart ||
    originalStart >= rangeEnd
  ) {

    return {
      totalMs: 0,
      normalMs: 0,
      overtimeMs: 0
    };

  }


  const clippedStart =
    new Date(
      Math.max(
        originalStart.getTime(),
        rangeStart.getTime()
      )
    );


  const clippedEnd =
    new Date(
      Math.min(
        originalEnd.getTime(),
        rangeEnd.getTime()
      )
    );


  const totalMs =
    Math.max(
      0,
      clippedEnd.getTime() -
      clippedStart.getTime()
    );


  const normalLimit =
    Number(
      state.settings.normalHours ||
      8
    ) *
    60 *
    60 *
    1000;


  /*
    Normal / OT คำนวณจากระยะเวลาของเวรจริง

    เช่น:
    10 ชั่วโมง
    = 8 ชั่วโมงปกติ
    + 2 ชั่วโมง OT
  */

  const fullDuration =
    Math.max(
      0,
      originalEnd.getTime() -
      originalStart.getTime()
    );


  const fullNormal =
    Math.min(
      fullDuration,
      normalLimit
    );


  const fullOT =
    state.settings.allowOvertime !== false
      ? Math.max(
          0,
          fullDuration -
          normalLimit
        )
      : 0;


  let normalMs = 0;
  let overtimeMs = 0;


  if (
    totalMs === fullDuration
  ) {

    normalMs =
      fullNormal;

    overtimeMs =
      fullOT;

  } else {

    /*
      กรณีเวรคร่อมวัน/ช่วงเวลา
      ตรวจว่าเวลาที่ถูกตัดอยู่ในส่วน
      Normal หรือ OT ของเวร
    */

    const normalEnd =
      new Date(
        originalStart.getTime() +
        normalLimit
      );


    const normalStartMs =
      Math.max(
        clippedStart.getTime(),
        originalStart.getTime()
      );


    const normalEndMs =
      Math.min(
        clippedEnd.getTime(),
        normalEnd.getTime()
      );


    normalMs =
      Math.max(
        0,
        normalEndMs -
        normalStartMs
      );


    overtimeMs =
      state.settings.allowOvertime !== false
        ? Math.max(
            0,
            totalMs -
            normalMs
          )
        : 0;

  }


  return {
    totalMs,
    normalMs,
    overtimeMs
  };

}


// =============================
// BUILD DASHBOARD DATA
// =============================

function buildAdminDashboardData() {

  const range =
    getDashboardDateRange();


  const shifts =
    Array.isArray(
      adminData.shifts
    )
      ? adminData.shifts
      : [];


  let totalMs = 0;
  let normalMs = 0;
  let overtimeMs = 0;
  let shiftCount = 0;


  const personnel =
    new Map();


  const daily =
    new Map();


  for (
    let cursor =
      new Date(range.start);

    cursor < range.end;

    cursor.setDate(
      cursor.getDate() + 1
    )
  ) {

    const key =
      dashboardDateKey(
        cursor
      );


    daily.set(
      key,
      {
        date:
          new Date(cursor),

        totalMs:
          0,

        normalMs:
          0,

        overtimeMs:
          0,

        shifts:
          0
      }
    );

  }


  for (const shift of shifts) {

    if (!shift.startAt) {
      continue;
    }


    const shiftStart =
      new Date(
        shift.startAt
      );


    const shiftEnd =
      shift.endAt
        ? new Date(
            shift.endAt
          )
        : new Date();


    if (
      shiftEnd <= range.start ||
      shiftStart >= range.end
    ) {

      continue;

    }


    const duration =
      getDashboardShiftDuration(
        shift,
        range.start,
        range.end
      );


    if (
      duration.totalMs <= 0
    ) {

      continue;

    }


    totalMs +=
      duration.totalMs;

    normalMs +=
      duration.normalMs;

    overtimeMs +=
      duration.overtimeMs;

    shiftCount++;


    // ---------------------------
    // PERSONNEL
    // ---------------------------

    const userId =
      getDashboardShiftUserId(
        shift
      ) ||
      `unknown-${getDashboardShiftName(
        shift
      )}`;


    if (
      !personnel.has(
        userId
      )
    ) {

      personnel.set(
        userId,
        {
          id:
            userId,

          name:
            getDashboardShiftName(
              shift
            ),

          totalMs:
            0,

          normalMs:
            0,

          overtimeMs:
            0,

          shifts:
            0
        }
      );

    }


    const person =
      personnel.get(
        userId
      );


    person.totalMs +=
      duration.totalMs;

    person.normalMs +=
      duration.normalMs;

    person.overtimeMs +=
      duration.overtimeMs;

    person.shifts++;


    // ---------------------------
    // DAILY
    // ---------------------------

    splitShiftIntoDashboardDays(
      shift,
      range,
      daily
    );

  }


  const people =
    [...personnel.values()]
      .sort(
        (a, b) =>
          b.totalMs -
          a.totalMs
      );


  return {

    range,

    totalMs,

    normalMs,

    overtimeMs,

    shiftCount,

    people,

    daily:
      [...daily.values()]

  };

}


// =============================
// SPLIT SHIFT BY DAY
// =============================

function splitShiftIntoDashboardDays(
  shift,
  range,
  daily
) {

  const originalStart =
    new Date(
      shift.startAt
    );


  const originalEnd =
    shift.endAt
      ? new Date(
          shift.endAt
        )
      : new Date();


  const cursor =
    new Date(
      Math.max(
        originalStart.getTime(),
        range.start.getTime()
      )
    );


  cursor.setHours(
    0,
    0,
    0,
    0
  );


  while (
    cursor < range.end &&
    cursor < originalEnd
  ) {

    const dayStart =
      new Date(cursor);


    const dayEnd =
      new Date(cursor);

    dayEnd.setDate(
      dayEnd.getDate() + 1
    );


    const clippedStart =
      new Date(
        Math.max(
          dayStart.getTime(),
          range.start.getTime()
        )
      );


    const clippedEnd =
      new Date(
        Math.min(
          dayEnd.getTime(),
          range.end.getTime()
        )
      );


    const duration =
      getDashboardShiftDuration(
        shift,
        clippedStart,
        clippedEnd
      );


    const key =
      dashboardDateKey(
        dayStart
      );


    const item =
      daily.get(key);


    if (
      item &&
      duration.totalMs > 0
    ) {

      item.totalMs +=
        duration.totalMs;

      item.normalMs +=
        duration.normalMs;

      item.overtimeMs +=
        duration.overtimeMs;

      item.shifts++;

    }


    cursor.setDate(
      cursor.getDate() + 1
    );

  }

}


// =============================
// DATE KEY
// =============================

function dashboardDateKey(
  date
) {

  return [
    date.getFullYear(),
    String(
      date.getMonth() + 1
    ).padStart(2, "0"),
    String(
      date.getDate()
    ).padStart(2, "0")
  ].join("-");

}


// =============================
// FORMAT DURATION
// =============================

function formatDashboardDuration(
  ms
) {

  const totalMinutes =
    Math.floor(
      Math.max(
        0,
        ms
      ) /
      60000
    );


  const h =
    Math.floor(
      totalMinutes / 60
    );


  const m =
    totalMinutes % 60;


  if (
    h === 0
  ) {

    return `${m} นาที`;

  }


  if (
    m === 0
  ) {

    return `${h} ชม.`;

  }


  return `${h} ชม. ${m} นาที`;

}


// =============================
// RENDER DASHBOARD
// =============================

function renderAdminDashboardStats() {

  const root =
    $("#dashboardStats");

  if (!root) {
    return;
  }


  const data =
    buildAdminDashboardData();


  root.innerHTML = `

    <div class="dashboard-period-info">

      <div>
        <span class="muted">
          ช่วงเวลาที่แสดง
        </span>

        <strong>
          ${esc(
            data.range.title
          )}
        </strong>
      </div>

    </div>


    <div class="stat-grid dashboard-kpi-grid">

      <div class="stat-card">

        <span>
          เวลาปฏิบัติงานรวม
        </span>

        <strong>
          ${formatDashboardDuration(
            data.totalMs
          )}
        </strong>

        <small class="muted">
          รวมเวลาทั้งหมด
        </small>

      </div>


      <div class="stat-card">

        <span>
          เวลาปกติ
        </span>

        <strong>
          ${formatDashboardDuration(
            data.normalMs
          )}
        </strong>

        <small class="muted">
          ภายในเวลาปกติ
        </small>

      </div>


      <div class="stat-card">

        <span>
          OT
        </span>

        <strong class="summary-ot">
          ${formatDashboardDuration(
            data.overtimeMs
          )}
        </strong>

        <small class="muted">
          เวลาทำงานล่วงเวลา
        </small>

      </div>


      <div class="stat-card">

        <span>
          จำนวนเวร
        </span>

        <strong>
          ${data.shiftCount}
        </strong>

        <small class="muted">
          ครั้ง
        </small>

      </div>


      <div class="stat-card">

        <span>
          บุคลากรที่ปฏิบัติงาน
        </span>

        <strong>
          ${data.people.length}
        </strong>

        <small class="muted">
          คน
        </small>

      </div>


      <div class="stat-card">

        <span>
          กำลังเข้าเวร
        </span>

        <strong>
          ${
            Array.isArray(
              adminData.active
            )
              ? adminData.active.length
              : 0
          }
        </strong>

        <small class="muted">
          คนในขณะนี้
        </small>

      </div>

    </div>


    <div class="card">

      <div class="card-title-row">

        <div>

          <h2 style="margin-bottom: 4px;">
            ชั่วโมงปฏิบัติงาน
          </h2>

          <p class="muted" style="margin: 0;">
            เปรียบเทียบเวลาปกติและ OT
          </p>

        </div>

      </div>


      ${adminDashboardChartHTML(
        data.daily
      )}


      <div class="dashboard-chart-legend">

        <span>
          <i class="dashboard-legend-normal"></i>
          เวลาปกติ
        </span>

        <span>
          <i class="dashboard-legend-ot"></i>
          OT
        </span>

      </div>

    </div>


    <div class="card">

      <div class="card-title-row">

        <div>

          <h2 style="margin-bottom: 4px;">
            สรุปรายบุคคล
          </h2>

          <p class="muted" style="margin: 0;">
            เวลาปฏิบัติงานของบุคลากรในช่วงที่เลือก
          </p>

        </div>

        <span class="dashboard-person-count">
          ${data.people.length} คน
        </span>

      </div>


      <div class="scroll">

        <table class="dashboard-person-table">

          <thead>

            <tr>

              <th>
                บุคลากร
              </th>

              <th>
                จำนวนเวร
              </th>

              <th>
                เวลาปกติ
              </th>

              <th>
                OT
              </th>

              <th>
                เวลารวม
              </th>

            </tr>

          </thead>


          <tbody>

            ${
              data.people.length
                ? data.people
                    .map(
                      person => `

                        <tr>

                          <td>

                            <strong>
                              ${esc(
                                person.name
                              )}
                            </strong>

                          </td>


                          <td>
                            ${person.shifts}
                          </td>


                          <td>

                            ${formatDashboardDuration(
                              person.normalMs
                            )}

                          </td>


                          <td>

                            <span class="dashboard-ot-value">

                              ${formatDashboardDuration(
                                person.overtimeMs
                              )}

                            </span>

                          </td>


                          <td>

                            <strong>

                              ${formatDashboardDuration(
                                person.totalMs
                              )}

                            </strong>

                          </td>

                        </tr>

                      `
                    )
                    .join("")
                : `

                    <tr>

                      <td
                        colspan="5"
                        class="history-empty"
                      >

                        ไม่มีข้อมูลการปฏิบัติงาน
                        ในช่วงเวลานี้

                      </td>

                    </tr>

                  `
            }

          </tbody>

        </table>

      </div>

    </div>

  `;

}


// =============================
// CHART
// =============================

function adminDashboardChartHTML(
  daily
) {

  if (
    !daily.length
  ) {

    return `

      <div class="dashboard-chart-empty">
        ไม่มีข้อมูล
      </div>

    `;

  }


  const maxMs =
    Math.max(
      1,
      ...daily.map(
        item =>
          item.totalMs
      )
    );


  return `

    <div class="dashboard-chart-scroll">

      <div
        class="dashboard-duty-chart"
        style="
          --dashboard-columns:
          ${daily.length};
        "
      >

        ${
          daily.map(
            item => {

              const normalHeight =
                item.normalMs /
                maxMs *
                190;


              const otHeight =
                item.overtimeMs /
                maxMs *
                190;


              const label =
                item.date.toLocaleDateString(
                  "th-TH",
                  {
                    day: "numeric",
                    month: "short"
                  }
                );


              const tooltip =
                [
                  label,
                  `ปกติ ${formatDashboardDuration(
                    item.normalMs
                  )}`,
                  `OT ${formatDashboardDuration(
                    item.overtimeMs
                  )}`,
                  `รวม ${formatDashboardDuration(
                    item.totalMs
                  )}`
                ].join(" | ");


              return `

                <div
                  class="dashboard-chart-column"
                  title="${esc(
                    tooltip
                  )}"
                >

                  <div class="dashboard-chart-value">

                    ${
                      item.totalMs > 0
                        ? formatDashboardDuration(
                            item.totalMs
                          )
                        : ""
                    }

                  </div>


                  <div class="dashboard-chart-bars">

                    <div
                      class="dashboard-chart-bar normal"
                      style="
                        height:
                        ${normalHeight}px;
                      "
                    >
                    </div>


                    <div
                      class="dashboard-chart-bar ot"
                      style="
                        height:
                        ${otHeight}px;
                      "
                    >
                    </div>

                  </div>


                  <small>
                    ${esc(label)}
                  </small>

                </div>

              `;

            }
          ).join("")
        }

      </div>

    </div>

  `;

}


// =============================
// ACTIVE SHIFTS
// =============================

function adminActive() {

  $("#adminBody")
    .innerHTML = `

      <div class="card">

        <h2>
          เวรปัจจุบัน
        </h2>

        <div class="scroll">

          <table>

            <thead>

              <tr>
                <th>ผู้ใช้</th>
                <th>เริ่ม</th>
                <th>จัดการ</th>
              </tr>

            </thead>

            <tbody>

              ${
                adminData.active.length
                  ? adminData.active
                    .map(
                      shift => `

                        <tr>

                          <td>
                            ${esc(
                              shift.username
                            )}
                          </td>

                          <td>
                            ${dt(
                              shift.startAt
                            )}
                          </td>

                          <td>

                            <button
                              class="
                                red
                                compact
                              "
                              onclick="
                                forceEnd(
                                  '${shift.id}'
                                )
                              "
                            >
                              บังคับออก
                            </button>

                          </td>

                        </tr>

                      `
                    )
                    .join("")
                  : `

                    <tr>
                      <td colspan="3">
                        ไม่มีผู้เข้าเวร
                      </td>
                    </tr>

                  `
              }

            </tbody>

          </table>

        </div>

      </div>

    `;

}


// =============================
// USERS
// =============================

function adminUsers() {

  $("#adminBody").innerHTML = `

    <div class="card">

      <div class="card-title-row">

        <h2>
          บุคลากร
        </h2>

        <button onclick="showAddUser()">
          + เพิ่มบุคลากร
        </button>

      </div>

      <div id="addUserBox"></div>

      <div class="scroll">

        <table>

          <thead>

            <tr>
              <th>ผู้ใช้</th>
              <th>ชื่อแสดงผล</th>
              <th>ระดับ</th>
              <th>สถานะ</th>
              <th>จัดการ</th>
            </tr>

          </thead>

          <tbody>

            ${
              adminData.users.length
                ? adminData.users
                    .map(
                      user => `

                        <tr>

                          <td>

                            <div class="user-cell">

                              ${
                                avatar(user)
                                  ? `
                                    <img
                                      src="${esc(
                                        avatar(user)
                                      )}"
                                      alt=""
                                    >
                                  `
                                  : ""
                              }

                              <span>

                                <strong>
                                  ${esc(
                                    user.displayName ||
                                    user.username ||
                                    "ไม่ทราบชื่อ"
                                  )}
                                </strong>

                                <small>
                                  ${esc(
                                    user.discordId
                                  )}
                                </small>

                              </span>

                            </div>

                          </td>


                          <td>

                            <input
                              id="name-${user.discordId}"
                              type="text"
                              maxlength="50"
                              value="${esc(
                                user.displayName ||
                                user.username ||
                                ""
                              )}"
                              placeholder="ชื่อแสดงผล"
                            >

                          </td>


                          <td>

                            <select
                              id="level-${user.discordId}"
                            >

                              <option
                                value="Head Admin"
                                ${
                                  user.isAdmin === true
                                    ? "selected"
                                    : ""
                                }
                              >
                                Head Admin
                              </option>

                              <option
                                value="Admin"
                                ${
                                  user.isAdmin !== true
                                    ? "selected"
                                    : ""
                                }
                              >
                                Admin
                              </option>

                            </select>

                          </td>


                          <td>

                            <select
                              id="enabled-${user.discordId}"
                            >

                              <option
                                value="true"
                                ${
                                  user.enabled !== false
                                    ? "selected"
                                    : ""
                                }
                              >
                                เปิดใช้งาน
                              </option>

                              <option
                                value="false"
                                ${
                                  user.enabled === false
                                    ? "selected"
                                    : ""
                                }
                              >
                                ระงับ
                              </option>

                            </select>

                          </td>


                          <td class="actions">

                            <button
                              class="compact"
                              onclick="saveUser('${user.discordId}')"
                            >
                              บันทึก
                            </button>

                            ${
                              String(user.discordId) !==
                              String(state.user.discordId)
                                ? `

                                  <button
                                    class="red compact"
                                    onclick="deleteUser('${user.discordId}')"
                                  >
                                    ลบ
                                  </button>

                                `
                                : ""
                            }

                          </td>

                        </tr>

                      `
                    )
                    .join("")
                : `

                    <tr>

                      <td
                        colspan="5"
                        class="muted"
                        style="
                          text-align: center;
                          padding: 30px;
                        "
                      >
                        ไม่พบบุคลากร
                      </td>

                    </tr>

                  `
            }

          </tbody>

        </table>

      </div>

    </div>

  `;

}


function showAddUser() {

  $("#addUserBox").innerHTML = `

    <div class="inline-form">

      <input
        id="newDiscordId"
        placeholder="Discord User ID"
      >

      <input
        id="newUsername"
        placeholder="ชื่อแสดงผล"
      >

      <select id="newLevel">

        <option value="Admin">
          Admin
        </option>

        <option value="Head Admin">
          Head Admin
        </option>

      </select>

      <button onclick="addUser()">
        เพิ่ม
      </button>

    </div>

  `;

}


async function addUser() {

  const discordId =
    $("#newDiscordId")
      ?.value
      .trim();

  const username =
    $("#newUsername")
      ?.value
      .trim();

  const level =
    $("#newLevel")
      ?.value;


  if (!discordId) {

    alert(
      "กรุณากรอก Discord User ID"
    );

    return;
  }


  if (!username) {

    alert(
      "กรุณากรอกชื่อแสดงผล"
    );

    return;
  }


  try {

    await api(
      "/api/admin/users",
      {
        method: "POST",

        body:
          JSON.stringify({

            discordId,

            username,

            level

          })
      }
    );


    await showAdmin(
      "users"
    );


  } catch (error) {

    console.error(
      "ADD USER:",
      error
    );

    alert(
      error.message ||
      "ไม่สามารถเพิ่มบุคลากรได้"
    );

  }

}


async function saveUser(id) {

  const nameInput =
    $(`#name-${id}`);

  const levelInput =
    $(`#level-${id}`);

  const enabledInput =
    $(`#enabled-${id}`);


  if (
    !nameInput ||
    !levelInput ||
    !enabledInput
  ) {

    alert(
      "ไม่พบข้อมูลบุคลากร"
    );

    return;
  }


  const displayName =
    nameInput.value.trim();


  if (!displayName) {

    alert(
      "กรุณากรอกชื่อแสดงผล"
    );

    return;
  }


  try {

    await api(
      `/api/admin/users/${encodeURIComponent(id)}`,
      {
        method: "PATCH",

        body:
          JSON.stringify({

            displayName,

            level:
              levelInput.value,

            enabled:
              enabledInput.value ===
              "true"

          })
      }
    );


    /*
      ถ้า Head Admin กำลังแก้บัญชีตัวเอง
      โหลดข้อมูล user ใหม่เพื่อให้ Header
      เปลี่ยนชื่อตามทันที
    */

    if (
      String(id) ===
      String(state.user.discordId)
    ) {

      state =
        await api("/api/me");

      showHeader();

    }


    await showAdmin(
      "users"
    );


  } catch (error) {

    console.error(
      "SAVE USER:",
      error
    );

    alert(
      error.message ||
      "ไม่สามารถบันทึกข้อมูลได้"
    );

  }

}


async function deleteUser(id) {

  const confirmed =
    await beautifulConfirm({

      title:
        "ลบบุคลากร",

      message:
        "ต้องการลบบุคลากรคนนี้หรือไม่? ประวัติเวรจะยังคงอยู่",

      type:
        "end",

      confirmText:
        "ลบ"

    });


  if (!confirmed) {
    return;
  }


  try {

    await api(
      `/api/admin/users/${encodeURIComponent(id)}`,
      {
        method: "DELETE"
      }
    );


    await showAdmin(
      "users"
    );


  } catch (error) {

    console.error(
      "DELETE USER:",
      error
    );

    alert(
      error.message ||
      "ไม่สามารถลบบุคลากรได้"
    );

  }

}

// =============================
// SHIFT MANAGEMENT
// =============================

function adminShifts() {

  $("#adminBody")
    .innerHTML = `

      <div class="card">

        <h2>
          ประวัติเวรล่าสุด
        </h2>

        <div class="scroll">

          <table>

            <thead>

              <tr>
                <th>ผู้ใช้</th>
                <th>เข้า</th>
                <th>ออก</th>
                <th>จัดการ</th>
              </tr>

            </thead>

            <tbody>

              ${
                adminData.shifts
                  .map(
                    shift => `

                      <tr>

                        <td>
                          ${esc(
                            shift.username
                          )}
                        </td>

                        <td>
                          ${dt(
                            shift.startAt
                          )}
                        </td>

                        <td>
                          ${dt(
                            shift.endAt
                          )}
                        </td>

                        <td>

                          <button
                            class="compact"
                            onclick="
                              editShift(
                                '${shift.id}'
                              )
                            "
                          >
                            แก้
                          </button>

                          <button
                            class="
                              red
                              compact
                            "
                            onclick="
                              deleteShift(
                                '${shift.id}'
                              )
                            "
                          >
                            ลบ
                          </button>

                        </td>

                      </tr>

                    `
                  )
                  .join("")
              }

            </tbody>

          </table>

        </div>

      </div>

    `;

}


async function editShift(id) {

  const shift =
    adminData.shifts
      .find(
        item =>
          item.id === id
      );

  if (!shift) {
    return;
  }

  const start =
    prompt(
      "เวลาเข้า (ISO)",
      shift.startAt
    );

  if (start === null) {
    return;
  }

  const end =
    prompt(
      "เวลาออก (ISO, เว้นว่าง = ยังไม่ออก)",
      shift.endAt || ""
    );

  if (end === null) {
    return;
  }

  try {

    await api(
      `/api/admin/shifts/${id}`,
      {
        method: "PATCH",

        body:
          JSON.stringify({

            startAt:
              start,

            endAt:
              end || null

          })
      }
    );

    await showAdmin(
      "shifts"
    );

  } catch (error) {

    alert(error.message);

  }

}


async function deleteShift(id) {

  const confirmed =
    await beautifulConfirm({
      title:
        "ลบประวัติเวร",

      message:
        "รายการนี้จะถูกลบออกจากระบบ",

      type:
        "end",

      confirmText:
        "ลบ"
    });

  if (!confirmed) {
    return;
  }

  try {

    await api(
      `/api/admin/shifts/${id}`,
      {
        method: "DELETE"
      }
    );

    await showAdmin(
      "shifts"
    );

  } catch (error) {

    alert(error.message);

  }

}


async function forceEnd(id) {

  const confirmed =
    await beautifulConfirm({
      title:
        "บังคับออกเวร",

      message:
        "ต้องการสิ้นสุดเวรของผู้ใช้นี้หรือไม่?",

      type:
        "end",

      confirmText:
        "บังคับออก"
    });

  if (!confirmed) {
    return;
  }

  try {

    await api(
      `/api/admin/shifts/${id}/force-end`,
      {
        method: "POST"
      }
    );

    await showAdmin(
      "active"
    );

  } catch (error) {

    alert(error.message);

  }

}
// =============================
// ADMIN LEAVE REQUESTS
// =============================

async function adminLeaves() {

  try {

    adminLeavesData =
      await api("/api/admin/leaves");

  } catch (error) {

    $("#adminBody").innerHTML = `
      <div class="card">
        ${esc(error.message)}
      </div>
    `;

    return;
  }

  renderAdminLeaves();
}


function renderAdminLeaves() {

  const leaves =
    Array.isArray(adminLeavesData)
      ? adminLeavesData
      : [];

  const search =
    String(
      $("#leaveAdminSearch")?.value || ""
    )
      .trim()
      .toLowerCase();

  const status =
    $("#leaveAdminStatus")?.value || "all";

  const type =
    $("#leaveAdminType")?.value || "all";


  const filtered =
    leaves.filter(leave => {

      const haystack = [
        leave.displayName,
        leave.username,
        leave.discordId,
        leave.reason,
        leave.adminNote
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !search ||
        haystack.includes(search);

      const matchesStatus =
        status === "all" ||
        leave.status === status;

      const matchesType =
        type === "all" ||
        leave.type === type;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesType
      );
    });


  const total =
    leaves.length;

  const pending =
    leaves.filter(
      item =>
        item.status === "pending"
    ).length;

  const approved =
    leaves.filter(
      item =>
        item.status === "approved"
    ).length;

  const rejected =
    leaves.filter(
      item =>
        item.status === "rejected"
    ).length;


  $("#adminBody").innerHTML = `

    <section class="leave-admin-page">

      <div class="leave-admin-hero">

        <div>

          <span class="leave-admin-eyebrow">
            LEAVE MANAGEMENT
          </span>

          <h2>
            จัดการคำขอลางาน
          </h2>

          <p>
            ตรวจสอบ อนุมัติ และจัดการ
            คำขอลางานของบุคลากร
          </p>

        </div>

        <div class="leave-admin-hero-icon">
          🗓️
        </div>

      </div>


      <div class="leave-admin-stats">

        <article class="leave-admin-stat total">

          <span class="leave-admin-stat-icon">
            ▦
          </span>

          <div>
            <small>คำขอทั้งหมด</small>
            <strong>${total}</strong>
          </div>

        </article>


        <article class="leave-admin-stat pending">

          <span class="leave-admin-stat-icon">
            ◷
          </span>

          <div>
            <small>รออนุมัติ</small>
            <strong>${pending}</strong>
          </div>

        </article>


        <article class="leave-admin-stat approved">

          <span class="leave-admin-stat-icon">
            ✓
          </span>

          <div>
            <small>อนุมัติแล้ว</small>
            <strong>${approved}</strong>
          </div>

        </article>


        <article class="leave-admin-stat rejected">

          <span class="leave-admin-stat-icon">
            ×
          </span>

          <div>
            <small>ไม่อนุมัติ</small>
            <strong>${rejected}</strong>
          </div>

        </article>

      </div>


      <div class="leave-admin-toolbar">

        <div class="leave-admin-search">

          <span>⌕</span>

          <input
            id="leaveAdminSearch"
            type="search"
            placeholder="ค้นหาชื่อ ผู้ใช้ หรือเหตุผล..."
            value="${esc(search)}"
            oninput="renderAdminLeaves()"
          >

        </div>


        <select
          id="leaveAdminStatus"
          onchange="renderAdminLeaves()"
        >

          <option
            value="all"
            ${
              status === "all"
                ? "selected"
                : ""
            }
          >
            ทุกสถานะ
          </option>

          <option
            value="pending"
            ${
              status === "pending"
                ? "selected"
                : ""
            }
          >
            รออนุมัติ
          </option>

          <option
            value="approved"
            ${
              status === "approved"
                ? "selected"
                : ""
            }
          >
            อนุมัติแล้ว
          </option>

          <option
            value="rejected"
            ${
              status === "rejected"
                ? "selected"
                : ""
            }
          >
            ไม่อนุมัติ
          </option>

        </select>


        <select
          id="leaveAdminType"
          onchange="renderAdminLeaves()"
        >

          <option
            value="all"
            ${
              type === "all"
                ? "selected"
                : ""
            }
          >
            ทุกประเภท
          </option>

          <option
            value="sick"
            ${
              type === "sick"
                ? "selected"
                : ""
            }
          >
            ลาป่วย
          </option>

          <option
            value="personal"
            ${
              type === "personal"
                ? "selected"
                : ""
            }
          >
            ลากิจ
          </option>

          <option
            value="vacation"
            ${
              type === "vacation"
                ? "selected"
                : ""
            }
          >
            ลาพักร้อน
          </option>

          <option
            value="other"
            ${
              type === "other"
                ? "selected"
                : ""
            }
          >
            อื่น ๆ
          </option>

        </select>

      </div>


      <div class="leave-admin-result-head">

        <div>

          <strong>
            รายการคำขอ
          </strong>

          <span>
            แสดง ${filtered.length}
            จาก ${total} รายการ
          </span>

        </div>

      </div>


      <div class="leave-admin-list">

        ${
          filtered.length

            ? filtered
                .map(leave => {

                  const name =
                    leave.displayName ||
                    leave.username ||
                    leave.discordId ||
                    "ไม่ทราบชื่อ";

                  const initial =
                    String(name)
                      .trim()
                      .charAt(0)
                      .toUpperCase() || "?";


                  return `

                    <article
                      class="
                        leave-admin-card
                        ${esc(
                          leave.status ||
                          "pending"
                        )}
                      "
                    >

                      <div class="leave-admin-card-main">


                        <div class="leave-admin-person">

                          <div class="leave-admin-avatar">
                            ${esc(initial)}
                          </div>


                          <div class="leave-admin-person-copy">

                            <div class="leave-admin-name-row">

                              <strong>
                                ${esc(name)}
                              </strong>

                              ${
                                leaveStatusBadge(
                                  leave.status
                                )
                              }

                            </div>

                            <span>
                              ${esc(
                                leave.username ||
                                leave.discordId ||
                                ""
                              )}
                            </span>

                          </div>

                        </div>


                        <div class="leave-admin-meta">

                          <div>

                            <small>
                              ประเภทการลา
                            </small>

                            <strong>
                              ${esc(
                                leaveTypeLabel(
                                  leave.type
                                )
                              )}
                            </strong>

                          </div>


                          <div>

                            <small>
                              ช่วงวันที่ลา
                            </small>

                            <strong>

                              ${
                                leaveDate(
                                  leave.startDate
                                )
                              }

                              <span>→</span>

                              ${
                                leaveDate(
                                  leave.endDate
                                )
                              }

                            </strong>

                          </div>


                          <div>

                            <small>
                              ส่งคำขอเมื่อ
                            </small>

                            <strong>
                              ${dt(
                                leave.createdAt
                              )}
                            </strong>

                          </div>

                        </div>


                        <div class="leave-admin-reason">

                          <small>
                            เหตุผลการลา
                          </small>

                          <p>
                            ${esc(
                              leave.reason || "-"
                            )}
                          </p>

                        </div>


                        ${
                          leave.adminNote

                            ? `

                              <div class="leave-admin-note">

                                <strong>
                                  หมายเหตุจาก Head Admin
                                </strong>

                                <span>
                                  ${esc(
                                    leave.adminNote
                                  )}
                                </span>

                              </div>

                            `

                            : ""
                        }


                        ${
                          leave.status !== "pending"

                            ? `

                              <div class="leave-admin-reviewed">

                                <span>

                                  ดำเนินการโดย

                                  <strong>
                                    ${esc(
                                      leave.reviewedByName ||
                                      "Head Admin"
                                    )}
                                  </strong>

                                </span>

                                <span>
                                  ${dt(
                                    leave.reviewedAt
                                  )}
                                </span>

                              </div>

                            `

                            : ""
                        }

                      </div>


                      <div class="leave-admin-card-actions">

                        ${
                          leave.status === "pending"

                            ? `

                              <button
                                class="
                                  leave-action
                                  approve
                                "
                                onclick="
                                  reviewLeave(
                                    '${esc(
                                      leave.id
                                    )}',
                                    'approved'
                                  )
                                "
                              >
                                ✓ อนุมัติ
                              </button>


                              <button
                                class="
                                  leave-action
                                  reject
                                "
                                onclick="
                                  reviewLeave(
                                    '${esc(
                                      leave.id
                                    )}',
                                    'rejected'
                                  )
                                "
                              >
                                ✕ ไม่อนุมัติ
                              </button>

                            `

                            : ""
                        }


                        <button
                          class="
                            leave-action
                            delete
                          "
                          onclick="
                            deleteLeave(
                              '${esc(
                                leave.id
                              )}'
                            )
                          "
                        >
                          🗑 ลบ
                        </button>

                      </div>

                    </article>

                  `;

                })
                .join("")

            : `

              <div class="leave-admin-empty">

                <div>
                  ⌕
                </div>

                <strong>
                  ไม่พบคำขอลางาน
                </strong>

                <span>
                  ลองเปลี่ยนคำค้นหา
                  หรือตัวกรองสถานะ
                </span>

              </div>

            `
        }

      </div>

    </section>
  `;
}


// =============================
// DELETE LEAVE
// =============================

async function deleteLeave(id) {

  const leave =
    adminLeavesData.find(
      item =>
        String(item.id) ===
        String(id)
    );


  const name =
    leave?.displayName ||
    leave?.username ||
    "รายการนี้";


  const confirmed =
    await beautifulConfirm({

      title:
        "ลบคำขอลางาน",

      message:
        `ต้องการลบคำขอลางานของ ${name} หรือไม่? การลบนี้ไม่สามารถย้อนกลับได้`,

      type:
        "end",

      confirmText:
        "ลบคำขอ"
    });


  if (!confirmed) {
    return;
  }


  try {

    await api(
      `/api/admin/leaves/${
        encodeURIComponent(id)
      }`,
      {
        method: "DELETE"
      }
    );


    adminLeavesData =
      adminLeavesData.filter(
        item =>
          String(item.id) !==
          String(id)
      );


    renderAdminLeaves();

  } catch (error) {

    alert(
      error.message ||
      "ไม่สามารถลบคำขอลางานได้"
    );

  }
}


// =============================
// REVIEW LEAVE
// =============================

async function reviewLeave(
  id,
  status
) {

  const note =
    prompt(

      status === "approved"

        ? "หมายเหตุการอนุมัติ (เว้นว่างได้)"

        : "ระบุเหตุผลที่ไม่อนุมัติ (เว้นว่างได้)"

    );


  if (note === null) {
    return;
  }


  try {

    await api(
      `/api/admin/leaves/${encodeURIComponent(id)}`,
      {
        method: "PATCH",

        body: JSON.stringify({
          status,
          adminNote:
            note.trim()
        })
      }
    );


    alert(
      status === "approved"
        ? "อนุมัติการลาเรียบร้อยแล้ว"
        : "ไม่อนุมัติการลาเรียบร้อยแล้ว"
    );


    await showAdmin(
      "leaves"
    );


  } catch (error) {

    alert(
      error.message
    );

  }
}

// =============================
// SETTINGS
// =============================

function adminSettings() {

  const settings =
    adminData.settings;

  $("#adminBody")
    .innerHTML = `

      <div class="card">

        <h2>
          ตั้งค่าระบบ
        </h2>

        <div class="setting-grid">

          <label>

            ชื่อองค์กร

            <input
              id="org"
              value="${esc(
                settings.organizationName
              )}"
            >

          </label>

          <label>

            เวลาปกติ (ชม.)

            <input
              id="normalHours"
              type="number"
              step="0.25"
              value="${
                settings.normalHours
              }"
            >

          </label>

          <label>

            บังคับออกเมื่อครบ (ชม.)

            <input
              id="forceHours"
              type="number"
              step="0.25"
              value="${
                settings
                  .forceClockOutHours
              }"
            >

          </label>

          <label>

            Auto Clock-out

            <select id="auto">

              <option
                value="true"
                ${
                  settings.autoClockOut
                    ? "selected"
                    : ""
                }
              >
                เปิด
              </option>

              <option
                value="false"
                ${
                  !settings.autoClockOut
                    ? "selected"
                    : ""
                }
              >
                ปิด
              </option>

            </select>

          </label>

          <label>

            Maintenance

            <select
              id="maintenance"
            >

              <option
                value="false"
                ${
                  !settings
                    .maintenanceMode
                    ? "selected"
                    : ""
                }
              >
                ปิด
              </option>

              <option
                value="true"
                ${
                  settings
                    .maintenanceMode
                    ? "selected"
                    : ""
                }
              >
                เปิด
              </option>

            </select>

          </label>

        </div>

        <br>

        <button
          onclick="saveSettings()"
        >
          บันทึกตั้งค่า
        </button>

      </div>

    `;

}


async function saveSettings() {

  try {

    await api(
      "/api/admin/settings",
      {
        method: "PATCH",

        body:
          JSON.stringify({

            organizationName:
              $("#org").value,

            normalHours:
              Number(
                $("#normalHours")
                  .value
              ),

            forceClockOutHours:
              Number(
                $("#forceHours")
                  .value
              ),

            autoClockOut:
              $("#auto").value ===
              "true",

            maintenanceMode:
              $("#maintenance")
                .value ===
              "true"

          })
      }
    );

    await load();

    await showAdmin(
      "settings"
    );

  } catch (error) {

    alert(error.message);

  }

}


// =============================
// AUDIT LOG
// =============================

function adminAudit() {

  $("#adminBody")
    .innerHTML = `

      <div class="card">

        <h2>
          Audit Log
        </h2>

        <div class="scroll">

          <table>

            <thead>

              <tr>
                <th>เวลา</th>
                <th>ผู้ดำเนินการ</th>
                <th>Action</th>
                <th>Target</th>
              </tr>

            </thead>

            <tbody>

              ${
                adminData.audit
                  .map(
                    item => `

                      <tr>

                        <td>
                          ${dt(
                            item.at
                          )}
                        </td>

                        <td>
                          ${esc(
                            item.actor
                          )}
                        </td>

                        <td>
                          ${esc(
                            item.action
                          )}
                        </td>

                        <td>
                          ${esc(
                            item.target ||
                            "-"
                          )}
                        </td>

                      </tr>

                    `
                  )
                  .join("")
              }

            </tbody>

          </table>

        </div>

      </div>

    `;

}


// =============================
// START APP
// =============================

load()
  .catch(
    error => {

      $("#app")
        .innerHTML = `

          <div class="card">

            <h2>
              เกิดข้อผิดพลาด
            </h2>

            <pre>
${esc(error.message)}
            </pre>

          </div>

        `;

    }
  );