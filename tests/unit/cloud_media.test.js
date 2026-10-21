const test = require('node:test');
const assert = require('node:assert/strict');

process.env.CLOUDINARY_CLOUD_NAME = 'demo';
const { publicIdFromUrl, thumbUrl, isOurs } = require('../../src/utils/cloud_media');

test('publicIdFromUrl: version aur extension hatao', () => {
  assert.equal(publicIdFromUrl('https://res.cloudinary.com/demo/image/upload/v1712/uliketailor/shop1/image-1-2.jpg'), 'uliketailor/shop1/image-1-2');
  assert.equal(publicIdFromUrl('https://res.cloudinary.com/demo/image/upload/v1/uploads/image-9.png'), 'uploads/image-9');
  assert.equal(publicIdFromUrl('https://res.cloudinary.com/demo/image/upload/c_fill,w_300,h_300,q_auto,f_auto/v1/uliketailor/s/a.jpg'), 'uliketailor/s/a');
});

test('doosre cloud / site ka URL nahi chhedte', () => {
  assert.equal(publicIdFromUrl('https://res.cloudinary.com/other/image/upload/v1/x.jpg'), null);
  assert.equal(publicIdFromUrl('https://example.com/a.jpg'), null);
  assert.equal(isOurs(null), false);
});

test('thumbUrl: Cloudinary par chhota version, baaki waise hi', () => {
  assert.equal(thumbUrl('https://res.cloudinary.com/demo/image/upload/v1/uliketailor/s/a.jpg'),
    'https://res.cloudinary.com/demo/image/upload/c_fill,w_300,h_300,q_auto,f_auto/v1/uliketailor/s/a.jpg');
  assert.equal(thumbUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg');
});
