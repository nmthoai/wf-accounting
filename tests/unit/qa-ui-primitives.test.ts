// QA pass, Oct 2026: a required Select's "Please fill out this field." bubble
// pointed at the page corner (over the sidebar), because Base UI pins the hidden
// validation input to the viewport. Select now wraps it with the trigger in a
// positioned box and moves the input to the trigger's bottom edge.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Select, SelectTrigger } from "@/components/ui/select";

test("a required Select keeps its validation input inside the field, not at the page corner", () => {
  const html = renderToStaticMarkup(h(Select, { value: "", required: true }, h(SelectTrigger, { id: "cat" }, h("span", null, "Choose"))));
  const wrapper = html.match(/^<div data-slot="select" class="([^"]*)">([\s\S]*)<\/div>$/);
  assert.ok(wrapper, `Select is not wrapped: ${html}`);
  const [, raw, inner] = wrapper;
  const cls = raw.replaceAll("&amp;", "&").replaceAll("&gt;", ">");
  assert.match(cls, /(^| )relative( |$)/);
  for (const c of ["[&>input]:absolute!", "[&>input]:top-auto!", "[&>input]:bottom-0!"]) assert.ok(cls.split(" ").includes(c), `missing ${c}`);
  // The trigger and the required input are both direct children of the wrapper.
  assert.match(inner, /^<button[^>]*data-slot="select-trigger"/);
  assert.match(inner, /<input[^>]*required=""[^>]*\/?>$/);
});
