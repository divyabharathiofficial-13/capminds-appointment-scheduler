(function(){
  "use strict";

  /* ============================================================
     DATA LAYER
     ============================================================ */
  var STORAGE_KEY = "capminds_appointments_v1";

  function uid(){ return "a_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2,8); }

  function loadAppointments(){
    try{
      var raw = localStorage.getItem(STORAGE_KEY);
      if(!raw){
        var seed = seedData();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
        return seed;
      }
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }catch(e){
      console.error("Could not read appointments from storage", e);
      return [];
    }
  }

  function saveAppointments(list){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); }
    catch(e){ console.error("Could not save appointments", e); showToast("Could not save — storage unavailable", true); }
  }

  function pad2(n){ return String(n).padStart(2,"0"); }
  function toISODate(d){ return d.getFullYear() + "-" + pad2(d.getMonth()+1) + "-" + pad2(d.getDate()); }

  function seedData(){
    var today = new Date();
    var mk = function(offsetDays, time, patient, doctor, hospital, specialty, reason){
      var d = new Date(today);
      d.setDate(d.getDate() + offsetDays);
      return { id: uid(), patientName: patient, doctorName: doctor, hospitalName: hospital, specialty: specialty, date: toISODate(d), time: time, reason: reason };
    };
    return [
      mk(0, "10:30", "James Merry", "Dr. Sara Cook", "Indus Cardio-General Hospital", "Cardiology", "Routine heart checkup and ECG review."),
      mk(0, "14:00", "Priya Nair", "Dr. Arjun Menon", "Fortis Hospital", "Dermatology", "Follow-up on skin allergy treatment."),
      mk(2, "09:15", "Meera Krishnan", "Dr. Sara Cook", "Marigold Dental Hospital", "Dentistry", "Vaccination for 2-year-old."),
      mk(2, "16:45", "Rahul Verma", "Dr. Sneha Gupta", "Global Hospitals", "Orthopedics", "Knee pain assessment."),
      mk(5, "11:00", "Divya Suresh", "Dr. Karthik Iyer", "Apollo Hospitals", "General Medicine", "Annual health check-up."),
      mk(9, "13:30", "Sanjay Patel", "Dr. Anitha Reddy", "Sunrise Multispeciality", "Neurology", "Persistent migraines, needs evaluation.")
    ];
  }

  var appointments = loadAppointments();

  /* ============================================================
     STATE
     ============================================================ */
  var today = new Date();
  var viewYear = today.getFullYear();
  var viewMonth = today.getMonth();
  var selectedDate = null;
  var editingId = null;
  var currentView = "calendar";

  /* ============================================================
     DOM REFS
     ============================================================ */
  var $ = function(id){ return document.getElementById(id); };

  var sidebar        = $("sidebar");
  var navCalendar     = $("navCalendar");
  var navDashboard    = $("navDashboard");
  var viewCalendar    = $("viewCalendar");
  var viewDashboard   = $("viewDashboard");
  var btnHamburger    = $("btnHamburger");
  var btnSidebarToggle= $("btnSidebarToggle");

  var calendarGrid    = $("calendarGrid");
  var monthLabel      = $("monthLabel");
  var eyebrow         = $("eyebrow");

  var tableBody        = $("tableBody");
  var tableEmpty       = $("tableEmpty");
  var searchPatient    = $("searchPatient");
  var searchDoctor     = $("searchDoctor");
  var filterFrom       = $("filterFrom");
  var filterTo         = $("filterTo");
  var btnUpdate        = $("btnUpdate");
  var btnClearFilters  = $("btnClearFilters");

  var modalOverlay    = $("modalOverlay");
  var modalTitle      = $("modalTitle");
  var apptForm        = $("apptForm");
  var btnBook         = $("btnBook");
  var btnModalClose   = $("btnModalClose");
  var btnCancel       = $("btnCancel");

  var toastEl   = $("toast");
  var toastMsg  = $("toastMsg");
  var toastIconSuccess = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
  var toastIconDanger  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';

  var MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  /* ============================================================
     VIEW SWITCHING
     ============================================================ */
  function switchView(view){
    currentView = view;
    viewCalendar.classList.toggle("active", view === "calendar");
    viewDashboard.classList.toggle("active", view === "dashboard");
    navCalendar.classList.toggle("active", view === "calendar");
    navDashboard.classList.toggle("active", view === "dashboard");
    sidebar.classList.remove("mobile-open");
    if(view === "dashboard") renderTable();
    else { renderCalendar(); }
  }
  navCalendar.addEventListener("click", function(){ switchView("calendar"); });
  navDashboard.addEventListener("click", function(){ switchView("dashboard"); });

  btnHamburger.addEventListener("click", function(){ sidebar.classList.toggle("mobile-open"); });
  btnSidebarToggle.addEventListener("click", function(){ sidebar.classList.toggle("collapsed"); });

  /* ============================================================
     FILTERING (shared by calendar + dashboard)
     ============================================================ */
  function getFilters(){
    return {
      patient: searchPatient.value.trim().toLowerCase(),
      doctor: searchDoctor.value.trim().toLowerCase(),
      from: filterFrom.value || null,
      to: filterTo.value || null
    };
  }
  function matchesFilters(appt, f){
    if(f.patient && appt.patientName.toLowerCase().indexOf(f.patient) === -1) return false;
    if(f.doctor && appt.doctorName.toLowerCase().indexOf(f.doctor) === -1) return false;
    if(f.from && appt.date < f.from) return false;
    if(f.to && appt.date > f.to) return false;
    return true;
  }
  function hasActiveFilters(f){ return !!(f.patient || f.doctor || f.from || f.to); }

  /* ============================================================
     HELPERS
     ============================================================ */
  function formatTime(t){
    if(!t) return "";
    var parts = t.split(":");
    var h = parseInt(parts[0], 10);
    var m = parts[1];
    var suffix = h >= 12 ? "PM" : "AM";
    var h12 = h % 12; if(h12 === 0) h12 = 12;
    return h12 + ":" + m + " " + suffix;
  }
  function formatDateShort(iso){
    var parts = iso.split("-").map(Number);
    var d = new Date(parts[0], parts[1]-1, parts[2]);
    return d.toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" });
  }
  function escapeHTML(str){
    var div = document.createElement("div");
    div.textContent = str == null ? "" : str;
    return div.innerHTML;
  }

  /* ============================================================
     RENDER: CALENDAR
     ============================================================ */
  function apptsByDate(){
    var map = {};
    appointments.forEach(function(a){
      if(!map[a.date]) map[a.date] = [];
      map[a.date].push(a);
    });
    Object.keys(map).forEach(function(k){ map[k].sort(function(x,y){ return x.time.localeCompare(y.time); }); });
    return map;
  }

  function renderEyebrow(){
    var upcoming = appointments
      .filter(function(a){ return (a.date + " " + a.time) >= (toISODate(today) + " " + pad2(today.getHours()) + ":" + pad2(today.getMinutes())); })
      .sort(function(a,b){ return (a.date+a.time).localeCompare(b.date+b.time); })[0];
    eyebrow.textContent = upcoming ? upcoming.patientName : "";
  }

  var WALK_ICON = '<svg class="walk-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4.5" r="1.6"/><path d="M10.5 20l1.7-5.5-2-1.8.8-4 3 1 1.5 3"/><path d="M7 15l3-2.8 2-3.7"/><path d="M13.5 12.8L17 15"/></svg>';

  function renderCalendar(){
    monthLabel.textContent = MONTH_NAMES[viewMonth] + " " + viewYear;
    $("selectView").value = String(viewMonth);
    renderEyebrow();
    calendarGrid.innerHTML = "";

    var firstOfMonth = new Date(viewYear, viewMonth, 1);
    var startWeekday = firstOfMonth.getDay();
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();
    var totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
    var map = apptsByDate();
    var todayISO = toISODate(today);
    var MAX_VISIBLE = 2;

    for(var i = 0; i < totalCells; i++){
      var dayNum, cellYear = viewYear, cellMonth = viewMonth, outside = false;
      if(i < startWeekday){ dayNum = daysInPrevMonth - startWeekday + 1 + i; cellMonth = viewMonth - 1; outside = true; }
      else if(i >= startWeekday + daysInMonth){ dayNum = i - (startWeekday + daysInMonth) + 1; cellMonth = viewMonth + 1; outside = true; }
      else { dayNum = i - startWeekday + 1; }
      if(cellMonth < 0){ cellMonth = 11; cellYear -= 1; }
      if(cellMonth > 11){ cellMonth = 0; cellYear += 1; }

      var cellDate = new Date(cellYear, cellMonth, dayNum);
      var iso = toISODate(cellDate);

      var cell = document.createElement("div");
      cell.className = "day-cell" + (outside ? " outside" : "") + (iso === todayISO ? " today" : "") + (iso === selectedDate ? " selected" : "");

      var numEl = document.createElement("div");
      numEl.className = "day-num";
      numEl.textContent = dayNum;
      cell.appendChild(numEl);

      var dayAppts = map[iso] || [];
      if(dayAppts.length){
        var wrap = document.createElement("div");
        wrap.className = "day-badges";

        dayAppts.slice(0, MAX_VISIBLE).forEach(function(a){
          var badge = document.createElement("div");
          badge.className = "day-badge";

          var top = document.createElement("div");
          top.className = "badge-top";
          top.innerHTML = WALK_ICON + '<span class="badge-text">' + escapeHTML(a.patientName) + " " + formatTime(a.time) + "</span>";
          badge.appendChild(top);

          var icons = document.createElement("div");
          icons.className = "badge-icons";

          var editBtn = document.createElement("button");
          editBtn.type = "button";
          editBtn.title = "Edit appointment";
          editBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
          editBtn.addEventListener("click", function(id){
            return function(e){ e.stopPropagation(); openModal("edit", id); };
          }(a.id));
          icons.appendChild(editBtn);

          var deleteBtn = document.createElement("button");
          deleteBtn.type = "button";
          deleteBtn.title = "Delete appointment";
          deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
          deleteBtn.addEventListener("click", function(id){
            return function(e){ e.stopPropagation(); deleteAppointment(id); };
          }(a.id));
          icons.appendChild(deleteBtn);

          var addBtn = document.createElement("button");
          addBtn.type = "button";
          addBtn.title = "Add another appointment on this date";
          addBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/></svg>';
          addBtn.addEventListener("click", function(dateISO){
            return function(e){ e.stopPropagation(); openModal("add", null, dateISO); };
          }(iso));
          icons.appendChild(addBtn);

          badge.appendChild(icons);
          badge.title = a.patientName + " — " + formatTime(a.time) + " with " + a.doctorName;
          badge.addEventListener("click", function(id){
            return function(e){ e.stopPropagation(); openModal("edit", id); };
          }(a.id));
          wrap.appendChild(badge);
        });

        if(dayAppts.length > MAX_VISIBLE){
          var more = document.createElement("button");
          more.type = "button";
          more.className = "day-more";
          more.textContent = "+" + (dayAppts.length - MAX_VISIBLE) + " more";
          more.addEventListener("click", function(dateISO){
            return function(e){
              e.stopPropagation();
              filterFrom.value = dateISO;
              filterTo.value = dateISO;
              switchView("dashboard");
            };
          }(iso));
          wrap.appendChild(more);
        }

        cell.appendChild(wrap);
      } else {
        var spacer = document.createElement("div");
        spacer.className = "day-dot";
        spacer.style.visibility = "hidden";
        cell.appendChild(spacer);
      }

      cell.addEventListener("click", function(dateISO){
        return function(){
          selectedDate = (selectedDate === dateISO) ? null : dateISO;
          renderCalendar();
        };
      }(iso));

      calendarGrid.appendChild(cell);
    }
  }

  /* ============================================================
     RENDER: DASHBOARD TABLE
     ============================================================ */
  function renderTable(){
    var filters = getFilters();
    var list = appointments.filter(function(a){ return matchesFilters(a, filters); });
    list.sort(function(a,b){
      if(a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.time.localeCompare(b.time);
    });

    tableBody.innerHTML = "";

    if(list.length === 0){
      tableEmpty.style.display = "block";
      return;
    }
    tableEmpty.style.display = "none";

    list.forEach(function(a){
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td class="link-cell">' + escapeHTML(a.patientName) + '</td>' +
        '<td class="link-cell">' + escapeHTML(a.doctorName) + '</td>' +
        '<td>' + escapeHTML(a.hospitalName) + '</td>' +
        '<td><span class="spec-pill">' + escapeHTML(a.specialty || "General") + '</span></td>' +
        '<td>' + formatDateShort(a.date) + '</td>' +
        '<td>' + formatTime(a.time) + '</td>' +
        '<td>' +
          '<div class="action-cell">' +
            '<button type="button" class="action-btn edit" data-action="edit" data-id="' + a.id + '" title="Edit" aria-label="Edit appointment"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>' +
            '<button type="button" class="action-btn delete" data-action="delete" data-id="' + a.id + '" title="Delete" aria-label="Delete appointment"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg></button>' +
          '</div>' +
        '</td>';
      tableBody.appendChild(tr);
    });
  }

  tableBody.addEventListener("click", function(e){
    var btn = e.target.closest("[data-action]");
    if(!btn) return;
    var id = btn.getAttribute("data-id");
    if(btn.getAttribute("data-action") === "edit") openModal("edit", id);
    else if(btn.getAttribute("data-action") === "delete") deleteAppointment(id);
  });

  btnUpdate.addEventListener("click", function(){ renderTable(); renderCalendar(); });
  btnClearFilters.addEventListener("click", function(){
    searchPatient.value = ""; searchDoctor.value = ""; filterFrom.value = ""; filterTo.value = "";
    selectedDate = null;
    renderTable(); renderCalendar();
  });
  [searchPatient, searchDoctor, filterFrom, filterTo].forEach(function(el){
    el.addEventListener("input", function(){ renderTable(); renderCalendar(); });
  });

  /* ============================================================
     CRUD
     ============================================================ */
  function deleteAppointment(id){
    var appt = appointments.find(function(a){ return a.id === id; });
    if(!appt) return;
    var ok = window.confirm('Delete the appointment for "' + appt.patientName + '" on ' + formatDateShort(appt.date) + " at " + formatTime(appt.time) + "?");
    if(!ok) return;
    appointments = appointments.filter(function(a){ return a.id !== id; });
    saveAppointments(appointments);
    renderTable(); renderCalendar();
    showToast("Appointment deleted");
  }

  /* ============================================================
     MODAL / FORM
     ============================================================ */
  var requiredFields = ["patientName","doctorName","hospitalName","specialty","apptDate","apptTime"];

  function refreshDatalists(){
    var uniq = function(key){
      var seen = {}, out = [];
      appointments.forEach(function(a){ if(a[key] && !seen[a[key]]){ seen[a[key]] = true; out.push(a[key]); } });
      return out;
    };
    var fill = function(listId, values){
      var dl = $(listId);
      dl.innerHTML = values.map(function(v){ return '<option value="' + escapeHTML(v) + '">'; }).join("");
    };
    fill("patientList", uniq("patientName"));
    fill("doctorList", uniq("doctorName"));
    fill("hospitalList", uniq("hospitalName"));
  }

  function openModal(mode, id, prefillDate){
    editingId = null;
    clearFormErrors();
    apptForm.reset();
    refreshDatalists();

    if(mode === "edit" && id){
      var appt = appointments.find(function(a){ return a.id === id; });
      if(!appt) return;
      editingId = id;
      modalTitle.textContent = "Edit Appointment";
      $("patientName").value = appt.patientName;
      $("doctorName").value = appt.doctorName;
      $("hospitalName").value = appt.hospitalName;
      $("specialty").value = appt.specialty;
      $("apptDate").value = appt.date;
      $("apptTime").value = appt.time;
      $("reason").value = appt.reason || "";
    } else {
      modalTitle.textContent = "Schedule Appointment";
      if(prefillDate) $("apptDate").value = prefillDate;
      else if(selectedDate) $("apptDate").value = selectedDate;
    }

    modalOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
    setTimeout(function(){ $("patientName").focus(); }, 50);
  }

  function closeModal(){
    modalOverlay.classList.remove("open");
    document.body.style.overflow = "";
    editingId = null;
  }

  btnBook.addEventListener("click", function(){ openModal("add"); });
  btnModalClose.addEventListener("click", closeModal);
  btnCancel.addEventListener("click", closeModal);
  modalOverlay.addEventListener("click", function(e){ if(e.target === modalOverlay) closeModal(); });
  document.addEventListener("keydown", function(e){ if(e.key === "Escape" && modalOverlay.classList.contains("open")) closeModal(); });

  function clearFormErrors(){
    requiredFields.forEach(function(id){
      var wrap = apptForm.querySelector('[data-field="' + id + '"]');
      if(wrap) wrap.classList.remove("error");
    });
    var timeMsg = $("timeErrorMsg");
    timeMsg.textContent = timeMsg.getAttribute("data-default");
  }
  function setFieldError(id, hasError){
    var wrap = apptForm.querySelector('[data-field="' + id + '"]');
    if(wrap) wrap.classList.toggle("error", hasError);
  }
  function validateForm(){
    clearFormErrors();
    var valid = true;
    requiredFields.forEach(function(id){
      var el = $(id);
      var val = (el.value || "").trim();
      if(!val){ setFieldError(id, true); valid = false; }
    });
    return valid;
  }

  function findConflict(data){
    return appointments.find(function(a){
      if(editingId && a.id === editingId) return false;
      if(a.date !== data.date || a.time !== data.time) return false;
      var sameDoctor = a.doctorName.trim().toLowerCase() === data.doctorName.trim().toLowerCase();
      var samePatient = a.patientName.trim().toLowerCase() === data.patientName.trim().toLowerCase();
      return sameDoctor || samePatient;
    });
  }

  apptForm.addEventListener("submit", function(e){
    e.preventDefault();
    if(!validateForm()){ showToast("Please fill in all required fields", true); return; }

    var data = {
      patientName: $("patientName").value.trim(),
      doctorName: $("doctorName").value.trim(),
      hospitalName: $("hospitalName").value.trim(),
      specialty: $("specialty").value,
      date: $("apptDate").value,
      time: $("apptTime").value,
      reason: $("reason").value.trim()
    };

    var conflict = findConflict(data);
    if(conflict){
      setFieldError("apptDate", true);
      setFieldError("apptTime", true);
      var sameDoctor = conflict.doctorName.trim().toLowerCase() === data.doctorName.trim().toLowerCase();
      var sameName = conflict.patientName.trim().toLowerCase() === data.patientName.trim().toLowerCase();
      var reasonText = sameDoctor && sameName
        ? "This patient and doctor already have an appointment"
        : sameDoctor
          ? "Dr. " + conflict.doctorName + " is already booked"
          : conflict.patientName + " already has an appointment";
      $("timeErrorMsg").textContent = reasonText + " at this time.";
      showToast(reasonText + " at " + formatTime(data.time) + " on " + formatDateShort(data.date), true);
      return;
    }

    if(editingId){
      appointments = appointments.map(function(a){ return a.id === editingId ? Object.assign({}, a, data) : a; });
      showToast("Appointment updated");
    } else {
      data.id = uid();
      appointments.push(data);
      showToast("Appointment booked");
    }

    saveAppointments(appointments);

    viewYear = parseInt(data.date.split("-")[0], 10);
    viewMonth = parseInt(data.date.split("-")[1], 10) - 1;
    selectedDate = data.date;

    closeModal();
    renderCalendar();
    renderTable();
  });

  /* ============================================================
     CALENDAR NAV
     ============================================================ */
  $("btnPrev").addEventListener("click", function(){ viewMonth -= 1; if(viewMonth < 0){ viewMonth = 11; viewYear -= 1; } renderCalendar(); });
  $("btnNext").addEventListener("click", function(){ viewMonth += 1; if(viewMonth > 11){ viewMonth = 0; viewYear += 1; } renderCalendar(); });
  $("btnToday").addEventListener("click", function(){ viewYear = today.getFullYear(); viewMonth = today.getMonth(); selectedDate = toISODate(today); renderCalendar(); });
  $("selectView").addEventListener("change", function(){ viewMonth = parseInt(this.value, 10); renderCalendar(); });

  /* ============================================================
     TOAST
     ============================================================ */
  var toastTimer = null;
  function showToast(msg, isDanger){
    toastMsg.textContent = msg;
    toastEl.classList.toggle("danger", !!isDanger);
    toastEl.querySelector("svg").outerHTML = isDanger ? toastIconDanger : toastIconSuccess;
    toastEl.classList.add("show");
    if(toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){ toastEl.classList.remove("show"); }, 2600);
  }

  /* ============================================================
     INIT
     ============================================================ */
  renderCalendar();
  renderTable();

})();