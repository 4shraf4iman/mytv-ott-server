/**
 * ELECTRONIC PROGRAM GUIDE (EPG) ENGINE
 * Renders TV schedules, timeline grid, and program metadata
 */

class EPGEngine {
  constructor(channels, onSelectChannel) {
    this.channels = channels;
    this.onSelectChannel = onSelectChannel;
    this.container = document.getElementById("epg-timeline-container");
    this.timeHeader = document.getElementById("epg-time-header");
  }

  render() {
    if (!this.container) return;
    this.container.innerHTML = "";

    const table = document.createElement("table");
    table.className = "epg-grid-table";

    // Build Time Header Row
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    const channelTh = document.createElement("th");
    channelTh.className = "epg-channel-col";
    channelTh.textContent = "CHANNEL";
    headerRow.appendChild(channelTh);

    const now = new Date();
    const timeSlots = [];
    const baseHour = now.getHours();

    for (let i = 0; i < 6; i++) {
      const slotTime = new Date(now);
      slotTime.setHours(baseHour + Math.floor(i / 2), (i % 2) * 30, 0, 0);
      const timeStr = slotTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      timeSlots.push(timeStr);

      const th = document.createElement("th");
      th.className = "epg-slot";
      th.style.fontWeight = "700";
      th.style.color = "var(--primary)";
      th.textContent = timeStr;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Build Channel Rows
    const tbody = document.createElement("tbody");

    this.channels.forEach((ch) => {
      const row = document.createElement("tr");

      // Channel Info Column
      const chTd = document.createElement("td");
      chTd.className = "epg-channel-col focusable";
      chTd.tabIndex = 0;
      chTd.innerHTML = `
        <div class="channel-logo-wrap" style="width:36px; height:36px;">
          <img src="${ch.logo}" alt="${ch.name}" onerror="this.style.display='none'">
        </div>
        <div style="min-width:0;">
          <div style="font-weight:700; font-size:13px; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${ch.name}
          </div>
          <div style="font-size:11px; color:var(--text-muted);">${ch.number} • ${ch.group}</div>
        </div>
      `;
      chTd.addEventListener("click", () => {
        if (this.onSelectChannel) this.onSelectChannel(ch);
      });
      row.appendChild(chTd);

      // Generate programs
      const schedule = generateScheduleForChannel(ch);

      schedule.slice(0, 6).forEach((prog, idx) => {
        const slotTd = document.createElement("td");
        slotTd.className = `epg-slot focusable ${prog.isCurrent ? "current-now" : ""}`;
        slotTd.tabIndex = 0;
        
        const startStr = (prog.startTime instanceof Date)
          ? prog.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : (prog.startTime || "");
        const endStr = (prog.endTime instanceof Date)
          ? prog.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : (prog.endTime || "");
        const timeDisplay = endStr ? `${startStr} - ${endStr}` : startStr;

        slotTd.innerHTML = `
          <div class="epg-slot-time">
            ${timeDisplay} ${prog.isCurrent ? '<span class="status-pill" style="padding:1px 6px; font-size:9px;">NOW</span>' : ''}
          </div>
          <div class="epg-slot-title">${prog.title}</div>
          <div class="epg-slot-desc">${prog.desc}</div>
        `;

        slotTd.addEventListener("click", () => {
          if (this.onSelectChannel) this.onSelectChannel(ch);
        });

        row.appendChild(slotTd);
      });

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    this.container.appendChild(table);
  }
}
