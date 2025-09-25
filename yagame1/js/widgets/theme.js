const themeElement = document.createElement('div');
themeElement.className = 'button';
themeElement.style.position = 'absolute';
themeElement.style.right = '0';
themeElement.style.bottom = '0';

const themeList = [
	{ text: '深色主题', class: 'darktheme' },
	{ text: '浅色主题', class: 'lighttheme' },
]
themeStorage = createStorage('ls', 'YaGameTheme', { themeID: 0 });
themeStorageData = themeStorage.load();
let themeID = themeStorageData.themeID ? themeStorageData.themeID : 0;

function addTheme() {
	const theme = themeList[themeID];
	themeElement.innerHTML = theme.text;
	document.body.classList.add(theme.class);
}
function removeTheme() {
	const theme = themeList[themeID];
	document.body.classList.remove(theme.class);
}
function switchTheme() {
	removeTheme();
	themeID = (themeID + 1) % themeList.length;
	themeStorageData.themeID = themeID;
	themeStorage.save();
	addTheme();
}
themeElement.addEventListener('click', switchTheme);
addEventListener('load', function () {
	document.body.appendChild(themeElement);
	addTheme();
});