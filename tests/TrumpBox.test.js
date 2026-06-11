'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadModule } = require('./helpers/loadModule');
const { makeT } = require('./helpers/loadI18n');

let dom;

before(() => {
  dom = new JSDOM('<html><body></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost',
  });
  global.document = dom.window.document;
  loadModule(dom, 'thousand/TrumpBox.js');
});

function mount() {
  const container = dom.window.document.createElement('div');
  const box = new dom.window.TrumpBox(container, makeT(dom));
  return { container, box };
}

describe('TrumpBox', () => {
  it('renders red suits (hearts) with the red class and the symbol', () => {
    const { container, box } = mount();
    box.render('♥', true);
    const suit = container.querySelector('.trump-box__suit');
    assert.equal(suit.textContent, '♥');
    assert.ok(suit.classList.contains('trump-box__suit--red'));
    assert.ok(!container.querySelector('.trump-box').classList.contains('hidden'));
  });

  it('renders red suits (diamonds) with the red class', () => {
    const { container, box } = mount();
    box.render('♦', true);
    const suit = container.querySelector('.trump-box__suit');
    assert.ok(suit.classList.contains('trump-box__suit--red'));
  });

  it('renders black suits (spades) with the black class', () => {
    const { container, box } = mount();
    box.render('♠', true);
    const suit = container.querySelector('.trump-box__suit');
    assert.equal(suit.textContent, '♠');
    assert.ok(suit.classList.contains('trump-box__suit--black'));
  });

  it('renders black suits (clubs) with the black class', () => {
    const { container, box } = mount();
    box.render('♣', true);
    const suit = container.querySelector('.trump-box__suit');
    assert.ok(suit.classList.contains('trump-box__suit--black'));
  });

  it('shows muted "No trump" when suit is null', () => {
    const { container, box } = mount();
    box.render(null, true);
    const suit = container.querySelector('.trump-box__suit');
    assert.equal(suit.textContent, 'No trump');
    assert.ok(suit.classList.contains('trump-box__suit--none'));
    assert.ok(!suit.classList.contains('trump-box__suit--red'));
    assert.ok(!suit.classList.contains('trump-box__suit--black'));
  });

  it('hides the box when not visible', () => {
    const { container, box } = mount();
    box.render('♥', false);
    assert.ok(container.querySelector('.trump-box').classList.contains('hidden'));
  });

  it('re-render is stateless: switching from red to black suit removes the red class', () => {
    const { container, box } = mount();
    box.render('♥', true);
    box.render('♣', true);
    const suit = container.querySelector('.trump-box__suit');
    assert.ok(suit.classList.contains('trump-box__suit--black'));
    assert.ok(!suit.classList.contains('trump-box__suit--red'));
  });
});
