import { describe, expect, it } from "vitest";
import { parseCommunitySearchResults } from "./steamCommunitySearch";

describe("parseCommunitySearchResults", () => {
  it("parses profile URL, name, and avatar from a real SearchCommunityAjax HTML fragment", () => {
    const html = `
						<div class="search_row" data-panel="{&quot;clickOnActivate&quot;:&quot;firstChild&quot;}" role="button" >
	<div class="mediumHolder_default" data-miniprofile="43147274" style="float:left;"><div class="avatarMedium"><a href="https://steamcommunity.com/profiles/76561198003413002"><img src="https://avatars.fastly.steamstatic.com/bd2fa2520c831f4f81779645e2a6c307666f6095_medium.jpg"></a></div></div>
	<div class="searchPersonaInfo">
		<a class="searchPersonaName" href="https://steamcommunity.com/profiles/76561198003413002">Decks</a><br />
					Dexter<br />			Honolulu, Hawaii, United States&nbsp;<img style="margin-bottom:-2px" src="https://community.fastly.steamstatic.com/public/images/countryflags/us.gif" border="0" />			</div>
	<div class="search_result_friend">
			</div>
	<div style="clear:right"></div>
		<div style="clear:both"></div>

			</div>
								<div class="search_row" data-panel="{&quot;clickOnActivate&quot;:&quot;firstChild&quot;}" role="button" >
	<div class="mediumHolder_default" data-miniprofile="109615539" style="float:left;"><div class="avatarMedium"><a href="https://steamcommunity.com/id/gabene55"><img src="https://avatars.fastly.steamstatic.com/0ae81ca7c6209a3391ea86d2da7ff019658732e0_medium.jpg"></a></div></div>
	<div class="searchPersonaInfo">
		<a class="searchPersonaName" href="https://steamcommunity.com/id/gabene55">Gabene</a><br />
								Distrito Federal, Mexico&nbsp;<img style="margin-bottom:-2px" src="https://community.fastly.steamstatic.com/public/images/countryflags/mx.gif" border="0" />			</div>
	<div class="search_result_friend">
			</div>
	<div style="clear:right"></div>
		<div style="clear:both"></div>

				<div class="search_match_info">
										<div>Custom URL: steamcommunity.com/id/<span style="color: whitesmoke">gabene55</span></div>
								</div>
		</div>`;

    const result = parseCommunitySearchResults(html);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      profileUrl: "https://steamcommunity.com/profiles/76561198003413002",
      name: "Decks",
      avatarUrl: "https://avatars.fastly.steamstatic.com/bd2fa2520c831f4f81779645e2a6c307666f6095_medium.jpg",
    });
    expect(result[1]).toEqual({
      profileUrl: "https://steamcommunity.com/id/gabene55",
      name: "Gabene",
      avatarUrl: "https://avatars.fastly.steamstatic.com/0ae81ca7c6209a3391ea86d2da7ff019658732e0_medium.jpg",
    });
  });

  it("returns an empty array for HTML with no result rows", () => {
    expect(parseCommunitySearchResults("<div>no results</div>")).toEqual([]);
  });
});
