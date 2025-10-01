const messageElement = document.createElement('div');

const confirmButtonElement = document.createElement('div');
confirmButtonElement.className = 'button';
confirmButtonElement.innerText = '确认';

const buttonsElement = document.createElement('div');
buttonsElement.appendChild(confirmButtonElement);

const dialogElement = document.createElement('dialog');
dialogElement.appendChild(messageElement);
dialogElement.appendChild(buttonsElement);

async function yaGameAlert(message) {
	return new Promise(function (resolve, reject) {
		function closeDialog() {
			confirmButtonElement.removeEventListener('click', clickConfirm);
			dialogElement.close();
		}
		function clickConfirm() {
			closeDialog();
			resolve();
		}
		messageElement.innerText = message;
		confirmButtonElement.addEventListener('click', clickConfirm);
		dialogElement.showModal();
	});
}


addEventListener('load', function () {
	document.body.appendChild(dialogElement);
});