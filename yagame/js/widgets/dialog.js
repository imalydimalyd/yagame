const messageElement = document.createElement('div');

const cancelButtonElement = document.createElement('div');
cancelButtonElement.className = 'padded button';
cancelButtonElement.innerText = '取消';

const confirmButtonElement = document.createElement('div');
confirmButtonElement.className = 'padded button';
confirmButtonElement.innerText = '确认';

const buttonsElement = document.createElement('div');
buttonsElement.appendChild(cancelButtonElement);
buttonsElement.appendChild(confirmButtonElement);

const dialogElement = document.createElement('dialog');
dialogElement.appendChild(messageElement);
dialogElement.appendChild(buttonsElement);

async function yaGameAlert(message) {
	cancelButtonElement.classList.add('nodisplay');
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

async function yaGameConfirm(message) {
	cancelButtonElement.classList.remove('nodisplay');
	return new Promise(function (resolve, reject) {
		function closeDialog() {
			cancelButtonElement.removeEventListener('click', clickCancel);
			confirmButtonElement.removeEventListener('click', clickConfirm);
			dialogElement.close();
		}
		function clickCancel() {
			closeDialog();
			resolve(false);
		}
		function clickConfirm() {
			closeDialog();
			resolve(true);
		}
		messageElement.innerText = message;
		cancelButtonElement.addEventListener('click', clickCancel);
		confirmButtonElement.addEventListener('click', clickConfirm);
		dialogElement.showModal();
	});
}

addEventListener('load', function () {
	document.body.appendChild(dialogElement);
});