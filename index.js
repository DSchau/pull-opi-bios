const puppeteer = require('puppeteer');
const mkdir = require('mkdirp-promise');
const got = require('got');
const fs = require('mz/fs');
const slug = require('slug');
const path = require('path');
const Promise = require('bluebird');
const url = require('url');

require('events').EventEmitter.prototype._maxListeners = 1000; // gross

const slugify = str => slug(str).toLowerCase();

function template(details, image) {
  return `
---
name: ${details.name}
title: ${details.title || 'Unknown Title'}
avatar: ${image || 'avatars/fallback.jpeg'}
${
  (details.social || [])
    .map(([site, href]) => `${site}: ${href}`)
    .join('\n')
}
---

${details.bio.trim()}
  `.trim().replace(/\n+---/, '\n---') + '\n';
}

async function run() {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const base = path.resolve('output');

  await mkdir(base);
    
  await page.goto('https://objectpartners.com/about');

  const people = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.people-container'))
      .reduce((all, node) => {
        return all.concat(
          Array.from(node.getElementsByTagName('a'))
            .map(node => node.getAttribute('href'))
        );
      }, []);
  });

  await Promise.each(people, async link => {
    await page.goto(link);

    const details = await page.evaluate(() => {
      return {
        name: document.querySelector('.author-name h1').innerText,
        title: document.querySelector('.author-position').innerText,
        avatar: document.querySelector('.author-media img').getAttribute('src'),
        bio: document.querySelector('.author-details').innerText,
        social: Array.from(document.querySelectorAll('.author-social-list li a'))
        .map(node => {
          const href = node.getAttribute('href');
          const site = href.split(/https?:\/\/(w{3})?/).pop().split('.').slice(0, -1).pop()
          return [site, href];
        })
      };
    });

    await mkdir(path.join(base, 'avatars'));

    const person = slugify(details.name);

    let imageName;
    if (details.avatar) {
      imageName = await got.get(details.avatar, {
        encoding: 'binary'
      })
        .then(response => {
          const ext = details.avatar.split('.').pop();
          const normalizedExt = ext === 'jpg' ? 'jpeg' : ext;
          const name = `${person}.${normalizedExt}`;
          return fs.writeFile(path.join(base, 'avatars', `${person}.${normalizedExt}`), response.body, 'binary')
            .then(() => `avatars/${name}`);
        });
    }

    const md = template(details, imageName);
    await fs.writeFile(path.join(base, `${person}.md`), md);
    console.log(`Wrote ${person}`);
  });
    
  browser.close();
}

run();
