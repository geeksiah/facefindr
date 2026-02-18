import fetch from 'node-fetch';

async function main() {
  const base = process.env.PRIVACY_API_BASE || 'http://localhost:3000';
  const url = `${base.replace(/\/$/, '')}/api/user/privacy-settings`;
  console.log('Testing privacy API at', url);

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch (e) { throw new Error('Response is not valid JSON: ' + text); }

    if (!json.settings) throw new Error('Missing `settings` key in response');
    const s = json.settings;
    const keys = [
      'profileVisible',
      'allowPhotoTagging',
      'showInSearch',
      'allowFaceRecognition',
      'shareActivityWithCreators',
      'emailMarketing',
    ];
    for (const k of keys) {
      if (typeof s[k] !== 'boolean') throw new Error(`Key ${k} is missing or not boolean`);
    }

    console.log('OK — privacy API returned canonical shape');
    process.exit(0);
  } catch (err) {
    console.error('Privacy API shape test failed:', err.message || err);
    process.exit(2);
  }
}

main();
