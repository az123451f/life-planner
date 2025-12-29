// --- Configuration & State ---
const App = {
    currentProjectId: null,
    projects: [] // Array of { id, name, lastModified }
};

// Canvas State (The internal state of a whiteboard)
let state = {
    pan: { x: 0, y: 0 },
    scale: 1,
    isPanning: false,
    isDragging: false,
    isResizing: false,
    isRotating: false,
    panStart: { x: 0, y: 0 },
    dragTarget: null,
    resizeTarget: null,
    rotateTarget: null,
    dragOffset: { x: 0, y: 0 },
    resizeStart: { w: 0, h: 0, x: 0, y: 0 },
    items: [],
    nextId: 1,
    bgPos: { x: 0, y: 0 } // For infinite grid illusion
};

// --- DOM Elements ---
// Views
const dashboardView = document.getElementById('dashboard');
const workspaceView = document.getElementById('workspace');
const projectGrid = document.getElementById('project-grid');

// Workspace
const canvas = document.getElementById('canvas');
const world = document.getElementById('world');
const createProjectBtn = document.getElementById('create-project-btn');
const backToDashBtn = document.getElementById('back-to-dash');

// Tools
const addTaskListBtn = document.getElementById('add-task-list');
const addNoteBoardBtn = document.getElementById('add-note-board');
const addStickyNoteBtn = document.getElementById('add-sticky-note');
const addArrowBtn = document.getElementById('add-arrow');


// --- Storage System ---
const STORAGE_KEY_INDEX = 'slp_projects_index';
const STORAGE_PREFIX = 'slp_project_';

function loadProjectIndex() {
    const raw = localStorage.getItem(STORAGE_KEY_INDEX);
    App.projects = raw ? JSON.parse(raw) : [];
}

function saveProjectIndex() {
    localStorage.setItem(STORAGE_KEY_INDEX, JSON.stringify(App.projects));
}

function saveCurrentProject() {
    if (!App.currentProjectId) return;
    const key = STORAGE_PREFIX + App.currentProjectId;
    // Debounce or just save on change? For simplicity, we'll save on every significant action or periodically
    // But since this is a prototype transform, let's explicit save for now, 
    // actually let's auto-save on every mouse up.
    
    const data = {
        items: state.items,
        pan: state.pan,
        scale: state.scale,
        nextId: state.nextId
    };
    localStorage.setItem(key, JSON.stringify(data));
    
    // Update timestamp
    const proj = App.projects.find(p => p.id === App.currentProjectId);
    if (proj) {
        proj.lastModified = Date.now();
        saveProjectIndex();
    }
}

function loadProjectData(id) {
    const raw = localStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return null; // Should ideally init empty
    return JSON.parse(raw);
}

function createNewProject() {
    const name = prompt("Project Name:", "My Life Plan");
    if (!name) return;
    
    const id = 'proj_' + Date.now();
    const newProject = { id, name, lastModified: Date.now() };
    
    App.projects.push(newProject);
    saveProjectIndex();
    
    // Init empty state for this project
    const defaultState = {
        items: [],
        pan: { x: 0, y: 0 },
        scale: 1,
        nextId: 1
    };
    localStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(defaultState));
    
    openProject(id);
}

function deleteProject(id, e) {
    if (e) e.stopPropagation();
    if (!confirm("Are you sure you want to delete this project?")) return;
    
    App.projects = App.projects.filter(p => p.id !== id);
    saveProjectIndex();
    localStorage.removeItem(STORAGE_PREFIX + id);
    renderDashboard();
}

function openProject(id) {
    App.currentProjectId = id;
    const data = loadProjectData(id);
    
    // Restore State
    state = {
        ...state, // keep UI flags like isPanning false
        items: data.items || [],
        pan: data.pan || { x: 0, y: 0 },
        scale: data.scale || 1,
        nextId: data.nextId || 1
    };
    
    // Switch View
    dashboardView.classList.add('hidden');
    workspaceView.classList.remove('hidden');
    
    // Render Workspace
    world.innerHTML = ''; // Clear old
    updateTransform();
    state.items.forEach(item => {
        if (item.type === 'task-list') renderTaskList(item);
        else if (item.type === 'note-board') renderNoteBoard(item);
        else if (item.type === 'sticky-note') renderStickyNote(item);
        else if (item.type === 'arrow') renderArrow(item);
    });
}

function goToDashboard() {
    saveCurrentProject(); // Ensure saved
    App.currentProjectId = null;
    workspaceView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    renderDashboard();
}


// --- Rendering Dashboard ---
function renderDashboard() {
    projectGrid.innerHTML = '';
    
    if (App.projects.length === 0) {
        projectGrid.innerHTML = '<p style="color:#6b7280; grid-column:1/-1; text-align:center;">No projects yet. Create one!</p>';
        return;
    }
    
    // Sort by new
    const sorted = [...App.projects].sort((a,b) => b.lastModified - a.lastModified);
    
    sorted.forEach(proj => {
        const card = document.createElement('div');
        card.className = 'project-card';
        card.onclick = () => openProject(proj.id);
        
        const dateStr = new Date(proj.lastModified).toLocaleDateString();
        
        card.innerHTML = `
            <div class="project-name">${proj.name}</div>
            <div class="project-date">Last edited: ${dateStr}</div>
            <div class="delete-project-btn" title="Delete Project">×</div>
        `;
        
        const delBtn = card.querySelector('.delete-project-btn');
        delBtn.onclick = (e) => deleteProject(proj.id, e);
        
        projectGrid.appendChild(card);
    });
}


// --- Initialization ---
function initApp() {
    loadProjectIndex();
    
    // Listeners
    createProjectBtn.addEventListener('click', createNewProject);
    backToDashBtn.addEventListener('click', goToDashboard);
    
    setupCanvasEventListeners(); // The old event listeners
    
    // Start at Dashboard
    renderDashboard();
}


// --- Canvas Interaction (Modified to Save) ---

function setupCanvasEventListeners() {
    canvas.addEventListener('mousedown', onCanvasMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    
    addTaskListBtn.addEventListener('click', () => { createItem('task-list', window.innerWidth/2, window.innerHeight/2); saveCurrentProject(); });
    addNoteBoardBtn.addEventListener('click', () => { createItem('note-board', window.innerWidth/2, window.innerHeight/2); saveCurrentProject(); });
    addStickyNoteBtn.addEventListener('click', () => { createItem('sticky-note', window.innerWidth/2, window.innerHeight/2); saveCurrentProject(); });
    addArrowBtn.addEventListener('click', () => { createItem('arrow', window.innerWidth/2, window.innerHeight/2); saveCurrentProject(); });
}

// Transform helpers
function getWorldPos(screenX, screenY) {
    return {
        x: (screenX - state.pan.x) / state.scale,
        y: (screenY - state.pan.y) / state.scale
    };
}

function updateTransform() {
    world.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.scale})`;
    const gridSize = 30 * state.scale;
    canvas.style.backgroundSize = `${gridSize}px ${gridSize}px`;
    canvas.style.backgroundPosition = `${state.pan.x}px ${state.pan.y}px`;
}

// Event handlers
function onCanvasMouseDown(e) {
    const itemEl = e.target.closest('.task-list, .note-board, .sticky-note, .arrow-item');
    const resizeHandle = e.target.closest('.resize-handle');
    const rotateHandle = e.target.closest('.rotate-handle');
    const isInteractive = e.target.closest('input, textarea, button, .task-checkbox, select, .color-dot');
    
    // 0. Rotate
    if (rotateHandle && itemEl) {
        state.isRotating = true;
        state.rotateTarget = itemEl;
        e.preventDefault();
        return;
    }

    // 1. Resize
    if (resizeHandle && itemEl) {
        state.isResizing = true;
        state.resizeTarget = itemEl;
        const itemData = state.items.find(i => i.id === itemEl.id);
        
        state.resizeStart = {
            w: itemData.w || (itemData.type==='sticky-note'?250:340),
            h: itemData.h || 450,
            x: e.clientX,
            y: e.clientY
        };
        e.preventDefault();
        return;
    }
    
    // 2. Drag
    // Allow drag if NOT interactive (text/input) OR if Drag Handle OR if ALT key is held
    const isDragHandle = e.target.closest('.drag-handle-icon');
    
    if (itemEl && (isDragHandle || !isInteractive || e.altKey)) {
        state.isDragging = true;
        state.dragTarget = itemEl;
        const itemData = state.items.find(i => i.id === itemEl.id);
        const worldPos = getWorldPos(e.clientX, e.clientY);
        state.dragOffset = { x: worldPos.x - itemData.x, y: worldPos.y - itemData.y };
        itemEl.style.zIndex = getMaxZIndex() + 1;
        e.preventDefault();
        return;
    }
    
    // 3. Pan
    if (!itemEl) {
        state.isPanning = true;
        state.panStart = { x: e.clientX, y: e.clientY };
        canvas.classList.add('dragging');
    }
}

function onMouseMove(e) {
    if (state.isPanning) {
        const dx = e.clientX - state.panStart.x;
        const dy = e.clientY - state.panStart.y;
        state.pan.x += dx;
        state.pan.y += dy;
        state.panStart = { x: e.clientX, y: e.clientY };
        updateTransform();
    } 
    else if (state.isDragging && state.dragTarget) {
        const worldPos = getWorldPos(e.clientX, e.clientY);
        const item = state.items.find(i => i.id === state.dragTarget.id);
        if (item) {
            item.x = worldPos.x - state.dragOffset.x;
            item.y = worldPos.y - state.dragOffset.y;
            // Update DOM Position
            state.dragTarget.style.left = item.x + 'px';
            state.dragTarget.style.top = item.y + 'px';
        }
    }
    else if (state.isResizing && state.resizeTarget) {
        const dx = (e.clientX - state.resizeStart.x) / state.scale;
        const dy = (e.clientY - state.resizeStart.y) / state.scale;
        const item = state.items.find(i => i.id === state.resizeTarget.id);
        
        if (item) {
            const minW = 50, minH = 30; // Min arrow dims
            item.w = Math.max(minW, state.resizeStart.w + dx);
            
            // For arrows, we usually want height to adjust thickness, 
            // but the user said "make it longer, shorter".
            // Let's assume Width = Length, Height = Thickness of the container.
            
            if (item.type === 'arrow') {
                 // For arrows, allow free resize of box, redraw SVG
                 item.h = Math.max(minH, state.resizeStart.h + dy);
                 state.resizeTarget.style.width = item.w + 'px';
                 state.resizeTarget.style.height = item.h + 'px';
                 updateArrowPath(state.resizeTarget, item.w, item.h);
            } else if (item.type !== 'sticky-note') {
                item.h = Math.max(100, state.resizeStart.h + dy);
                state.resizeTarget.style.width = item.w + 'px';
                state.resizeTarget.style.height = item.h + 'px';
            } else {
                 // Sticky note: only resize width
                 item.w = Math.max(200, state.resizeStart.w + dx);
                 state.resizeTarget.style.width = item.w + 'px';
                 const ta = state.resizeTarget.querySelector('textarea');
                 if(ta) {
                     ta.style.height = 'auto';
                     ta.style.height = ta.scrollHeight + 'px';
                 }
            }
        }
    }
    // ... rotate logic ...
    else if (state.isRotating && state.rotateTarget) {
        const item = state.items.find(i => i.id === state.rotateTarget.id);
        if (item) {
            // Calculate angle from center of element to mouse
            const rect = state.rotateTarget.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            
            const rad = Math.atan2(e.clientY - cy, e.clientX - cx);
            const deg = rad * (180 / Math.PI);
            
            // +90 because handle is at Top (-90 deg visually). Mouse at Top should be rotation 0.
            item.rotation = deg + 90;
            
            state.rotateTarget.style.transform = `rotate(${item.rotation}deg)`;
        }
    }
}

// Helper for dynamic arrow path
function updateArrowPath(el, w, h) {
    const path = el.querySelector('path');
    if (!path) return;
    
    // Dynamic Arrow Drawing
    // w = total length
    // h = total height (thickness of head)
    
    const headLen = Math.min(40, w * 0.4); 
    const shaftThick = h * 0.4; // Shaft is 40% of total height
    const headThick = h;      // Head is 100% of total height
    
    // Y coordinates centered at h/2
    const cy = h / 2;
    const shaftTop = cy - shaftThick/2;
    const shaftBot = cy + shaftThick/2;
    const headTop = cy - headThick/2;
    const headBot = cy + headThick/2;
    
    const d = `M 0 ${shaftTop} L ${w-headLen} ${shaftTop} L ${w-headLen} ${headTop} L ${w} ${cy} L ${w-headLen} ${headBot} L ${w-headLen} ${shaftBot} L 0 ${shaftBot} Z`;
    
    path.setAttribute('d', d);
}

function onMouseUp() {
    if (state.isPanning || state.isDragging || state.isResizing || state.isRotating) {
        saveCurrentProject(); // Auto-save on interaction end
    }
    state.isPanning = false;
    state.isDragging = false;
    state.isResizing = false;
    state.isRotating = false;
    state.dragTarget = null;
    state.resizeTarget = null;
    state.rotateTarget = null;
    canvas.classList.remove('dragging');
}

function onWheel(e) {
    e.preventDefault();
    const zoomSpeed = 0.001;
    const newScale = Math.min(Math.max(0.2, state.scale - e.deltaY * zoomSpeed), 3);
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = (mx - state.pan.x) / state.scale;
    const wy = (my - state.pan.y) / state.scale;
    state.pan.x = mx - wx * newScale;
    state.pan.y = my - wy * newScale;
    state.scale = newScale;
    updateTransform();
    
    // Debounce save for zoom? or just save.
    // Saving on zoom every frame is bad, usually onMouseUp handles "end of interaction" saving, but Wheel doesn't have "WheelUp".
    // Let's just rely on periodic or mouseup for now, or add a debounce if needed.
    // For now, no save on wheel to avoid lag.
}

function getMaxZIndex() {
    let max = 0;
    document.querySelectorAll('.task-list, .note-board, .sticky-note, .arrow-item').forEach(el => {
        const z = parseInt(window.getComputedStyle(el).zIndex) || 0;
        if (z > max) max = z;
    });
    return max;
}

// Item Creation
function createItem(type, screenX, screenY) {
    const worldPos = getWorldPos(screenX, screenY);
    const id = type + '-' + state.nextId++;
    
    // Default dims per type
    let dw = 300, dh = 400;
    if (type === 'sticky-note') { dw = 250; dh = 'auto'; }
    if (type === 'task-list') { dw = 300; dh = 'auto'; }
    if (type === 'note-board') { dw = 340; dh = 450; }
    if (type === 'arrow') { dw = 200; dh = 60; }
    
    // Fix: If dh is 'auto', use a safe default (e.g., 200) for centering calculation to avoid NaN
    const calcH = (dh === 'auto') ? 200 : dh;
    
    const baseItem = {
        id, type, x: worldPos.x - dw/2, y: worldPos.y - calcH/2,
        w: dw, h: dh, rotation: 0 // Init rotation
    };
    
    if (type === 'task-list') {
        baseItem.title = 'New Task List';
        baseItem.tasks = [];
    } else if (type === 'note-board') {
        baseItem.title = '';
        baseItem.noteType = 'daily';
        baseItem.date = new Date().toLocaleDateString();
        baseItem.sections = [{id:1, title:'', content:''}];
    } else if (type === 'sticky-note') {
        baseItem.text = '';
        baseItem.color = 'yellow';
    } else if (type === 'arrow') {
        baseItem.color = 'blue';
    }
    
    state.items.push(baseItem);
    
    if (type === 'task-list') renderTaskList(baseItem);
    else if (type === 'note-board') renderNoteBoard(baseItem);
    else if (type === 'sticky-note') renderStickyNote(baseItem);
    else if (type === 'arrow') renderArrow(baseItem);
    
    saveCurrentProject();
}

// Renderers
// Helper for common wrapper properties (pos, size, rot)
function setCommonStyles(div, data) {
    div.id = data.id;
    div.style.left = data.x + 'px';
    div.style.top = data.y + 'px';
    div.style.width = data.w + 'px';
    if(data.h !== 'auto') div.style.height = data.h + 'px';
    if(data.rotation) div.style.transform = `rotate(${data.rotation}deg)`;
}

// Helper to add delete functionality
function setupDeleteBtn(div, data) {
    const btn = div.querySelector('.delete-btn');
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Remove from DOM
        div.remove();
        // Remove from State
        state.items = state.items.filter(i => i.id !== data.id);
        saveCurrentProject();
    });
    btn.addEventListener('mousedown', e => e.stopPropagation()); // Prevent drag start
}

function renderArrow(data) {
    const div = document.createElement('div');
    div.className = 'arrow-item';
    setCommonStyles(div, data);
    
    // Create empty SVG, path will be set by helper
    div.innerHTML = `
        <div class="delete-btn"></div>
        <div class="drag-handle-icon"></div>
        <svg class="arrow-svg" style="overflow:visible">
            <path fill="#3b82f6" stroke="#2563eb" stroke-width="2" vector-effect="non-scaling-stroke" />
        </svg>
        <div class="resize-handle"></div>
        <div class="rotate-handle"></div>
    `;
    world.appendChild(div);
    
    // Initial draw
    updateArrowPath(div, data.w, data.h);
    setupDeleteBtn(div, data);
}

function renderTaskList(data) {
    const div = document.createElement('div');
    div.className = 'task-list';
    setCommonStyles(div, data);
    
    div.innerHTML = `
        <div class="delete-btn"></div>
        <div class="drag-handle-icon"></div>
        <div class="task-list-header">
            <input class="task-list-title" value="${data.title}" placeholder="List Title...">
        </div>
        <div class="task-list-content"></div>
        <button class="add-task-btn">+ Add Task</button>
        <div class="rotate-handle"></div>
    `;
    
    // ... listeners (same) ...
    const titleInput = div.querySelector('.task-list-title');
    titleInput.addEventListener('input', () => { data.title = titleInput.value; saveCurrentProject(); });
    titleInput.addEventListener('mousedown', e => e.stopPropagation());
    
    div.querySelector('.add-task-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        addTask(data, div);
    });
    
    setupDeleteBtn(div, data);
    
    world.appendChild(div);
    if (data.tasks.length === 0) addTask(data, div);
}

// ... addTask & renderTasks (unchanged) ...
function addTask(data, div) {
    data.tasks.push({ id: Date.now(), text: '', checked: false });
    renderTasks(data, div);
    saveCurrentProject();
}

function renderTasks(data, div) {
    const list = div.querySelector('.task-list-content');
    list.innerHTML = '';
    data.tasks.forEach(task => {
        const row = document.createElement('div');
        row.className = 'task-item';
        row.innerHTML = `
            <div class="task-checkbox ${task.checked?'checked':''}"></div>
            <input class="task-input ${task.checked?'checked':''}" value="${task.text}" placeholder="Task...">
        `;
        row.querySelector('.task-checkbox').onclick = (e) => {
            e.stopPropagation(); task.checked = !task.checked; renderTasks(data, div); saveCurrentProject();
        };
        const inp = row.querySelector('.task-input');
        inp.oninput = () => { task.text = inp.value; saveCurrentProject(); };
        inp.onmousedown = e => e.stopPropagation();
        list.appendChild(row);
    });
}

function renderNoteBoard(data) {
    const div = document.createElement('div');
    div.className = 'note-board';
    setCommonStyles(div, data);
    div.dataset.type = data.noteType;
    
    div.innerHTML = `
        <div class="delete-btn"></div>
        <div class="drag-handle-icon"></div>
        <div class="note-header">
            <div class="note-meta">
                <select class="note-type-select">
                    <option value="daily" ${data.noteType === 'daily' ? 'selected' : ''}>Daily</option>
                    <option value="weekly" ${data.noteType === 'weekly' ? 'selected' : ''}>Weekly</option>
                    <option value="monthly" ${data.noteType === 'monthly' ? 'selected' : ''}>Monthly</option>
                    <option value="yearly" ${data.noteType === 'yearly' ? 'selected' : ''}>Yearly</option>
                </select>
                <span class="note-date">${data.date}</span>
            </div>
            <input class="note-title" value="${data.title}" placeholder="Board Title...">
        </div>
        <div class="note-content"></div>
        <button class="add-section-btn">+ Add Split / Line</button>
        <div class="resize-handle"></div>
        <div class="rotate-handle"></div>
    `;
    
    // ... listeners (same) ...
    const sel = div.querySelector('.note-type-select');
    sel.onchange = () => { data.noteType = sel.value; div.dataset.type = sel.value; saveCurrentProject(); };
    sel.onmousedown = e => e.stopPropagation();
    
    const tit = div.querySelector('.note-title');
    tit.oninput = () => { data.title = tit.value; saveCurrentProject(); };
    tit.onmousedown = e => e.stopPropagation();
    
    div.querySelector('.add-section-btn').onclick = (e) => {
        e.stopPropagation();
        data.sections.push({ id: Date.now(), title: '', content: '' });
        renderNoteSections(data, div);
        saveCurrentProject();
    };
    
    setupDeleteBtn(div, data);
    
    renderNoteSections(data, div);
    world.appendChild(div);
}

// ... renderNoteSections (unchanged) ...
function renderNoteSections(data, div) {
    const cont = div.querySelector('.note-content');
    cont.innerHTML = '';
    
    data.sections.forEach(sec => {
        const secEl = document.createElement('div');
        secEl.className = 'note-section';
        secEl.innerHTML = `
            <div class="section-header">
                <input class="section-title" value="${sec.title}" placeholder="Section Title (e.g. January)">
            </div>
            <textarea class="section-textarea" placeholder="Write here..."></textarea>
        `;
        
        const ta = secEl.querySelector('.section-textarea');
        ta.value = sec.content;
        
        const titleInp = secEl.querySelector('.section-title');
        titleInp.oninput = () => { sec.title = titleInp.value; saveCurrentProject(); };
        titleInp.onmousedown = e => e.stopPropagation();
        
        ta.oninput = () => {
            sec.content = ta.value;
            ta.style.height = 'auto';
            ta.style.height = ta.scrollHeight + 'px';
            saveCurrentProject();
        };
        ta.onmousedown = e => e.stopPropagation();
        
        cont.appendChild(secEl);
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
    });
}

function renderStickyNote(data) {
    const div = document.createElement('div');
    div.className = `sticky-note sticky-${data.color}`;
    setCommonStyles(div, data);
    
    div.innerHTML = `
        <div class="delete-btn"></div>
        <div class="drag-handle-icon"></div>
        <div class="sticky-colors">
            <div class="color-dot" style="background:#fef3c7" data-color="yellow"></div>
            <div class="color-dot" style="background:#bae6fd" data-color="blue"></div>
            <div class="color-dot" style="background:#bbf7d0" data-color="green"></div>
            <div class="color-dot" style="background:#fbcfe8" data-color="pink"></div>
        </div>
        <div class="sticky-content">
            <textarea class="sticky-textarea" placeholder="Write..."></textarea>
        </div>
        <div class="resize-handle"></div>
        <div class="rotate-handle"></div>
    `;
    
    setupDeleteBtn(div, data);
    
    const ta = div.querySelector('.sticky-textarea');
    ta.value = data.text;
    
    const autoGrow = () => {
        data.text = ta.value;
        ta.style.height = 'auto';
        ta.style.height = ta.scrollHeight + 'px';
    };
    
    ta.addEventListener('input', () => { autoGrow(); saveCurrentProject(); });
    ta.addEventListener('mousedown', e => e.stopPropagation());
    
    setTimeout(autoGrow, 0); 
    
    div.querySelectorAll('.color-dot').forEach(dot => {
        dot.onclick = (e) => {
            e.stopPropagation();
            data.color = dot.dataset.color;
            div.className = `sticky-note sticky-${data.color}`;
            saveCurrentProject();
        };
        dot.onmousedown = e => e.stopPropagation();
    });
    
    world.appendChild(div);
}

// Start App
initApp();
