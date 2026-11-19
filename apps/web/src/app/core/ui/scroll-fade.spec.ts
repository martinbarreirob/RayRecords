import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ScrollFade } from './scroll-fade';

@Component({
  imports: [ScrollFade],
  template: '<div appScrollFade></div>',
})
class Host {}

describe('ScrollFade', () => {
  /** jsdom has no layout: the scroll metrics are set by hand. */
  function setup(scrollHeight: number, clientHeight: number) {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const box = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('div')!;
    Object.defineProperty(box, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(box, 'clientHeight', { value: clientHeight, configurable: true });
    const scrollTo = (top: number) => {
      box.scrollTop = top;
      box.dispatchEvent(new Event('scroll'));
      fixture.detectChanges();
    };
    scrollTo(0);
    const edges = () => ({
      top: box.classList.contains('fade-top'),
      bottom: box.classList.contains('fade-bottom'),
    });
    return { box, scrollTo, edges };
  }

  it('marks the box so the global style applies', () => {
    expect(setup(100, 100).box.classList.contains('scroll-fade')).toBe(true);
  });

  it('has no fade when everything fits', () => {
    expect(setup(300, 300).edges()).toEqual({ top: false, bottom: false });
  });

  it('fades only the bottom at the start', () => {
    expect(setup(900, 300).edges()).toEqual({ top: false, bottom: true });
  });

  it('fades both edges in the middle', () => {
    const { scrollTo, edges } = setup(900, 300);
    scrollTo(200);
    expect(edges()).toEqual({ top: true, bottom: true });
  });

  it('fades only the top at the end, even a pixel short', () => {
    const { scrollTo, edges } = setup(900, 300);
    scrollTo(599);
    expect(edges()).toEqual({ top: true, bottom: false });
  });
});
