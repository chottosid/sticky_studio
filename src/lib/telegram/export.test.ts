import { describe, expect, it } from 'vitest';
import { parseTelegramExportHtml } from './export';

// Trimmed from a real Telegram Desktop HTML export.
const html = `
<div class="page_header"><div class="content"><div class="text bold">
Job Circular storage
</div></div></div>
<div class="history">
<div class="message service" id="message-1"><div class="body details">
12 September 2026
</div></div>
<div class="message service" id="message1243303"><div class="body details">
মিমাই created group &laquo;Job Circular storage&raquo;
</div></div>
<div class="message default clearfix" id="message1243304">
<div class="body">
<div class="pull_right date details" title="12.09.2026 12:27:48 UTC+06:00">12:27</div>
<div class="from_name">
মিমাই 
</div>
<div class="media_wrap clearfix">
<a class="photo_wrap clearfix pull_left" href="photos/photo_1@12-09-2026_12-27-48.jpg">
<img class="photo" src="photos/photo_1@12-09-2026_12-27-48_thumb.jpg"/>
</a>
</div>
</div>
</div>
<div class="message default clearfix joined" id="message1243305">
<div class="body">
<div class="pull_right date details" title="12.09.2026 12:28:02 UTC+06:00">12:28</div>
<div class="text">
UNDP Internship &amp; more <a href="https://share.google/iam">https://share.google/iam</a><br>Apply <a href="https://example.com/apply">here</a>
</div>
</div>
</div>
<div class="message default clearfix" id="message1249611">
<div class="body">
<div class="pull_right date details" title="07.10.2026 15:03:10 UTC+06:00">15:03</div>
<div class="from_name">
Swarup Siddharth 
</div>
<div class="forwarded body">
<div class="from_name">
Tamim Hasan Saad<span class="date details" title="07.10.2026 12:32:43 UTC+06:00"> 07.10.2026 12:32:43</span>
</div>
<div class="text">
Software Engineer role<br>CV: <a href="mailto:hr@leads-bd.com">hr@leads-bd.com</a>
</div>
</div>
</div>
</div>
</div>`;

describe('parseTelegramExportHtml', () => {
  const parsed = parseTelegramExportHtml(html);

  it('reads the chat title and skips service messages', () => {
    expect(parsed.title).toBe('Job Circular storage');
    expect(parsed.messages.map((message) => message.message_id)).toEqual([1243304, 1243305, 1249611]);
  });

  it('reads posting time with its UTC offset', () => {
    expect(parsed.messages[0].date).toBe(Date.parse('2026-09-12T12:27:48+06:00') / 1_000);
  });

  it('gives joined messages the sender of the message before them', () => {
    expect(parsed.messages[1].from?.id).toBe(parsed.messages[0].from?.id);
    expect(parsed.messages[2].from?.id).not.toBe(parsed.messages[0].from?.id);
  });

  it('keeps photo paths, text with line breaks, and hidden links', () => {
    expect(parsed.messages[0].photo?.[0].file_id).toBe('photos/photo_1@12-09-2026_12-27-48.jpg');
    expect(parsed.messages[1].text).toBe('UNDP Internship & more https://share.google/iam\nApply here');
    expect(parsed.messages[1].entities).toEqual([{ type: 'text_link', url: 'https://example.com/apply' }]);
  });

  it('records forwarded messages with their original date', () => {
    expect(parsed.messages[2].forward_origin).toEqual({
      type: 'user', date: Date.parse('2026-10-07T12:32:43+06:00') / 1_000,
    });
    expect(parsed.messages[2].text).toBe('Software Engineer role\nCV: hr@leads-bd.com');
  });
});
