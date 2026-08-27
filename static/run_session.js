const csrftoken = document.querySelector('[name=csrfmiddlewaretoken]').value
var interval = null
var loc = window.location
const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

$(document).ready(async function () {
    endpoint = `${protocol}://${loc.host}/websocket/session_id=${session_id}`
    console.log(endpoint)
    const socket = new WebSocket(endpoint);

    socket.onopen = function () {
        console.log('Session socket connected');
    };

    socket.onmessage = function(e) {
        const event = JSON.parse(e.data);
        console.log('Receiving event:', event.type, event);

        switch (event.type) {
            case 'session_logs':
            case 'log_batch':
                loadlogs(event);
                break;
            case 'session_status':
                updateSessionStatus(event);
                const stopSignal = event.status === 'killed'
                isStopFile(stopSignal);
                updateMicroscopeBusyAlert(event.status, event.replay);
                break;
            case 'pause_status':
                const pauseState = event.status === 'signal_send'
                isPaused(pauseState);
                break;
            case 'pause_conf':
                const pauseConf = {pause: event.status === 'pause_set'}
                setPause(pauseConf);
                break;
            case 'disk_status':
                systemDiskUpdate(event);
                break;

            default:
                console.warn('Unhandled message type:', event.type, event);
        }
    }

    socket.onclose = function (e) {
        console.error('Session socket closed unexpectedly', e.code, e.reason);
        // updateSessionStatus('disconnected');
    };

    socket.onerror = function (e) {
        console.error('Session socket error', e);
    };
});

// start or stop the session
async function startSession(start = true, screeningMode = false) {
    let url = `/api/sessions/${session_id}/run_session/`;
    var str = start ? 'start' : 'stop';
    var r = confirm(`Do you want to ${str} this session?`);

    if (r == true) {
        // try {
            let requestData = { 'start': start, 'screening_mode': screeningMode };
            return apifetchAsync(url, requestData, "POST", message='Starting session')
        //     const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || "";
        //     const response = await fetch(url, {
        //         method: "POST",
        //         headers: {
        //             "Content-Type": "application/json",
        //             "X-CSRFToken": csrfToken
        //         },
        //         body: JSON.stringify(requestData)
        //     });

        //     if (!response.ok) {
        //         throw new Error(`Server error: ${response.status} ${response.statusText}`);
        //     }

        //     console.log("API Response:", response);
        //     return response; // Returns the Response object directly

        // } catch (error) {
        //     console.error("API Error:", error);
        //     return { error: error.message };
        // }
        
    } else {
        console.log("Cancelled by user");
    }
}

async function togglePause() {
    console.log('toggling pause')
    let url = `/api/sessions/${session_id}/pause_between_grids/`
    resp = await apifetchAsync(url, { 'pause': '' }, 'PUT', 'Toggling auto-pause');
    setPause(resp)
    console.log('Response:', resp)

}

async function continueRun(value) {
    let url = `/api/sessions/${session_id}/continue_run/`
    resp = await apifetchAsync(url, { 'continue': value }, 'PUT', 'Continuing or skipping');
    isPaused(resp)
    console.log('Response:', resp)

}

function setPause(data) {
    pause = document.getElementById('pause')
    pause.classList.remove('btn-outline-success')
    pause.classList.remove('btn-outline-danger')
    console.log(data.pause)
    if (data.pause === true) {
        pause.classList.add('btn-outline-success')
    } else {
        pause.classList.add('btn-outline-danger')
    }
}

function systemDiskUpdate(data) {
    const disk = document.getElementById('disk');
    if (!disk) return;

    disk.innerHTML = `Disk usage: ${data.disk_usage[0]} GB total <wbr>| 
                        ${data.disk_usage[1]} GB free <wbr>| 
                        ${data.disk_usage[2]}% full`;
}

function isStopFile(data) {
    console.log('Is Stop File?', data)

    if (data == true) {
        $('#stopSignal').removeClass('d-none')
        return
    }
    $('#stopSignal').addClass('d-none')
}

function isPaused(paused) {
    paused_div = document.getElementById('paused')
    if (paused === true) {
        paused_div.classList.remove('hidden')
    } else {
        paused_div.classList.add('hidden')
    }
}

function appendLine(processType, line, isBacklog = false) {
    const el = document.getElementById(processType); // 'out' or 'proc'
    if (!el) return;

    // clear the "Fetching Logs..." stub the first time real content arrives
    if (el.dataset.stubCleared !== 'true') {
        el.innerHTML = '';
        el.dataset.stubCleared = 'true';
    }

    const atBottom = el.scrollHeight - el.clientHeight <= el.scrollTop + 8;

    const lineEl = document.createElement('div');
    if (isBacklog) lineEl.classList.add('log-backlog');
    lineEl.textContent = '> ' + line;
    el.appendChild(lineEl);

    const MAX_LINES = 1000;
    while (el.children.length > MAX_LINES) {
        el.removeChild(el.firstChild);
    }

    if (atBottom) {
        el.scrollTop = el.scrollHeight;
    }
}

async function loadlogs(data) {
    if (data.type === 'session_logs') {
        // single live line
        appendLine(data.process_type, data.line, false);
        return;
    }

    if (data.type === 'log_batch') {
        // backlog array
        for (const entry of data.lines) {
            appendLine(entry.process_type, entry.line, true);
        }
    }
    // out = document.getElementById('out')
    // proc = document.getElementById('proc')
    // for (const el of [out, proc]) {
    //     console.log(el.id)
    //     const atBottom = el.scrollHeight - el.clientHeight <= el.scrollTop + 8
    //     const prevTop = el.scrollTop

    //     el.innerHTML = data[el.id]
    //     el.scrollTop = atBottom ? el.scrollHeight : prevTop
    // }
    // disk.innerHTML = `Disk usage: ${data.disk[0]} GB total <wbr>| ${data.disk[1]} GB free <wbr>| ${data.disk[2]}% full`
}

//checkIsRunning tracks staus of the session and changes the button from start to stop and vice versa
function updateSessionStatus(event) {
    const element = document.getElementById('start-button');
    console.log('Session status received:', event.status)

    const isRunning = event.status === 'running';

    // Toggle button styles and update value/text
    element.classList.toggle('btn-outline-danger', isRunning);
    element.classList.toggle('btn-outline-primary', !isRunning);
    element.value = isRunning ? 'stop' : 'start';
    element.innerHTML = isRunning ? 'Stop' : 'Start';

    // Force an attribute update to ensure it registers correctly
    element.setAttribute("value", isRunning ? "stop" : "start");

    let dropdown = document.querySelector(".dropdown-menu");
    if (element.value === "stop"){
            dropdown.style.display = "none";
    }

    updateSessionStatusPill(event);
}

function updateSessionStatusPill(data) {
    if (!data || !data.status) {
        $('#sessionStatus').html('No process').css('color', '').css('text-transform', '');
        $('#sessionStatusIcon').css('color', '').removeClass('bi-circle-fill').addClass('bi-circle');
        $('#sessionStatusIcon').closest('.badge-pill').css('border-color', '').css('--pill-color', '');

        $('#sessionPID').html('PID: --');
        $('#sessionStartTime').html('Start: --');
        $('#sessionEndTime').html('End: --');
        $('#sessionInfoIcon').removeClass('bi-circle-fill').addClass('bi-circle');
        return;
    }

    const sessionStatusColorMap = {
        'complete':  '#28a745',
        'finished':  '#28a745',
        'running':   'var(--bs-primary)',
        'error':     '#dc3545',
        'killed':  'var(--bs-red)',
        'stopped':    'var(--bs-orange)',
    };
    const color = sessionStatusColorMap[data.status] || 'var(--bs-secondary)';

    $('#sessionStatus').html(`${data.status}`)
        .css('color', color)
        .css('text-transform', 'uppercase');
    $('#sessionStatusIcon').css('color', color).removeClass('bi-circle').addClass('bi-circle-fill');
    $('#sessionStatusIcon').closest('.badge-pill')
        .css('border-color', color)
        .css('--pill-color', color);

    if (data.status === 'running') {
        $('#sessionPID').html(`PID: ${data.process_pid ?? '--'}`);
        $('#sessionStartTime').html(`Start: ${formatSessionDate(data.update_time)}`);
        $('#sessionInfoIcon').removeClass('bi-circle').addClass('bi-circle-fill');
    } else {
        $('#sessionEndTime').html(`End: ${formatSessionDate(data.update_time)}`);
    }
}

function formatSessionDate(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '--';
    return date.toLocaleString('en-CA', { 'localeMatcher': 'lookup', 'hour12': false });
}

function updateMicroscopeBusyAlert(status) {
    const TERMINAL_STATUSES = ['complete', 'error', 'finished', 'stopped'];
    const alertContainer = document.getElementById('microscope-busy-alert');
    if (!alertContainer) return;

    if (TERMINAL_STATUSES.includes(status)) {
        alertContainer.style.display = 'none';
    } else {
        alertContainer.style.display = '';
    }
}

$(document).ready(function () {
    $(document).on("click", ".session-toggle, .screening-type", async function (e) {
    const startButton = document.getElementById("start-button");
    if (!startButton) {
      console.error("Start button not found!");
      return;
    }

    const isStarting = startButton.getAttribute("value") === "start";

    // If this click came from the toggle button while in "start" mode,
    // it's just opening the dropdown — do nothing.
    if ($(this).hasClass("session-toggle") && isStarting) {
      return;
    }

    const screeningMode = isStarting ? $(this).data("mode") === true : null;
    console.log("Mode:", isStarting ? "Start" : "Stop",
      "Screening:", screeningMode ? "Atlas Only" : "Full Screening");

    try {
      const run_status = await startSession(isStarting, screeningMode);
      console.log("Session Status:", run_status);
    } catch (error) {
      console.error("Error in session start/stop:", error);
    }
  });
});

$('#force-start-button').on('click', async function () {
    console.log(this)
    let val = (this.value === "start");
    run_status = await startSession(val);
})

$('#removeLockButton, #forceKill').on('click', async function () {
    console.log(`Running ${this.value}`)
    let url = `/api/sessions/${session_id}/${this.value}/`
    data = await apifetchAsync(url, null, 'POST', 'Removing microscope lock file')
    console.log(data)
})

// $('#stop-button').on('click', function () { start(start = false);is_running=false; checkIsRunning()})
$('#pause').on('click', function () { togglePause() })
$('#continue-next, #continue').on('click', function () { console.log(this, this.value); continueRun(this.value) })

