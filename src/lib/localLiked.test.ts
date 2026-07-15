import { describe, expect, it } from "vitest";
import { addLiked, removeLiked } from "./localLiked";

describe("addLiked", () => {
  it("dodaje nowy appid", () => {
    expect(addLiked([1, 2], 3)).toEqual([1, 2, 3]);
  });

  it("nie duplikuje juz obecnego appid", () => {
    expect(addLiked([1, 2], 2)).toEqual([1, 2]);
  });
});

describe("removeLiked", () => {
  it("usuwa appid z listy", () => {
    expect(removeLiked([1, 2, 3], 2)).toEqual([1, 3]);
  });

  it("nie wywala sie gdy appid nie istnieje na liscie", () => {
    expect(removeLiked([1, 2], 5)).toEqual([1, 2]);
  });
});
