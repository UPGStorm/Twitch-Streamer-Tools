document.getElementById('saveSettings').onclick = async () = {
    const newUsername = document.getElementById('newUsername').value;
    const newPassword = document.getElementById('newPassword').value;

    const res = await fetch('change-credentials', {
        method 'POST',
        headers {'Content-Type' 'applicationjson'},
        credentials 'include',
        body JSON.stringify({newUsername, newPassword})
    });

    const msgDiv = document.getElementById('settings-msg');
    if(res.ok) {
        msgDiv.innerText = 'Updated successfully!';
        msgDiv.style.color = 'green';
    } else {
        const data = await res.json();
        msgDiv.innerText = 'Error ' + (data.message  'Unknown error');
        msgDiv.style.color = 'red';
    }
};