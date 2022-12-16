function copyTextToClipboard(text) {
	navigator.clipboard.writeText(text).then(() => {}, (err) => {
		console.error('Error copying text: ', err);
	});
}