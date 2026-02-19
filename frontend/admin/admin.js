const categoryTable = document.getElementById('categoryTable');
const addCategoryForm = document.getElementById('addCategoryForm');
const labelInput = addCategoryForm.elements[0];
const weightInput = addCategoryForm.elements[1];

let currentUserId = null;

// Load categories for the logged-in user
async function loadCategories() {
    try {
        const res = await fetch('/api/categories', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const categories = await res.json();
        categoryTable.innerHTML = '';
        categories.forEach(cat => addCategoryToTable(cat));
    } catch (err) {
        console.error('Failed to load categories:', err);
    }
}

function addCategoryToTable(cat) {
    if (categoryTable.querySelector(`tr[data-id="${cat._id}"]`)) return;
    const tr = document.createElement('tr');
    tr.dataset.id = cat._id;
    tr.innerHTML = `
        <td>${cat.label}</td>
        <td>${cat.weight}</td>
        <td>
            <button class="btn btn-sm btn-danger">Delete</button>
        </td>
    `;
    tr.querySelector('button').onclick = async () => {
        try {
            const res = await fetch(`/api/categories/${cat._id}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            tr.remove();
        } catch (err) {
            console.error('Failed to delete category:', err);
        }
    };
    categoryTable.appendChild(tr);
}

addCategoryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = labelInput.value.trim();
    const weight = parseInt(weightInput.value, 10);
    if (!label || isNaN(weight) || weight <= 0) return;

    try {
        const res = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ label, weight })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const newCat = await res.json();
        addCategoryToTable(newCat);
        addCategoryForm.reset();
    } catch (err) {
        console.error('Failed to add category:', err);
    }
});

// Socket.IO — join the room for this user's wheel
const socket = io();

// Wait until we have the userId before joining
async function initSocket() {
    try {
        const res = await fetch('/api/me', { credentials: 'include' });
        const data = await res.json();
        currentUserId = data.userId;

        // Join the user-specific socket room
        socket.emit('joinAdmin', currentUserId);
    } catch (err) {
        console.error('Failed to init socket:', err);
    }
}

socket.on('categories', (cats) => {
    cats.forEach(cat => addCategoryToTable(cat));
});

socket.on('category-updated', (cat) => {
    const tr = categoryTable.querySelector(`tr[data-id="${cat._id}"]`);
    if (tr) {
        tr.cells[0].textContent = cat.label;
        tr.cells[1].textContent = cat.weight;
    }
});

socket.on('category-deleted', ({ id }) => {
    const tr = categoryTable.querySelector(`tr[data-id="${id}"]`);
    if (tr) tr.remove();
});

// Init
loadCategories();
initSocket();
