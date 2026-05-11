export interface EmailTemplateParams {
  lang?: string;
  previewText: string;
  heading: string;
  body: string;
  footerText: string;
  /** Either a button+link or a code block */
  action:
    | { type: "button"; buttonText: string; buttonVar: string; urlCaption: string }
    | { type: "code"; codeVar: string };
}

export function buildEmailHtml(p: EmailTemplateParams): string {
  const buttonOrCode =
    p.action.type === "button"
      ? `
            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
              style="margin-bottom:24px;text-align:center;">
              <tbody><tr><td>
                <a href="${p.action.buttonVar}"
                  style="display:inline-block;background-color:rgb(59,130,246);color:rgb(255,255,255);font-size:16px;font-weight:600;text-decoration:none;text-align:center;padding:12px 32px;border-radius:8px;line-height:24px;"
                  target="_blank">${p.action.buttonText}</a>
              </td></tr></tbody>
            </table>
            <p style="font-size:14px;color:rgb(107,114,128);margin-bottom:16px;line-height:20px;margin-top:16px;text-align:center;">
              ${p.action.urlCaption}
            </p>
            <p style="font-size:14px;color:rgb(59,130,246);margin-bottom:24px;line-height:20px;word-break:break-all;text-align:center;">
              ${p.action.buttonVar}
            </p>`
      : `
            <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
              style="background-color:rgb(249,250,251);border-width:1px;border-color:rgb(229,231,235);border-radius:8px;padding:24px;margin-bottom:24px;text-align:center;">
              <tbody><tr><td>
                <p style="font-size:32px;font-weight:700;letter-spacing:4px;color:rgb(31,41,55);margin:0;">${p.action.codeVar}</p>
              </td></tr></tbody>
            </table>`;

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="${p.lang ?? "en"}">
  <head>
    <link rel="preload" as="image" href="{{site_logo_url}}" />
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
  </head>
  <body style="background-color:rgb(243,244,246);font-family:ui-sans-serif,system-ui,sans-serif;padding-top:40px;padding-bottom:40px;">
    <!--$-->
    <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">${p.previewText}</div>
    <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
      style="background-color:rgb(255,255,255);border-radius:8px;margin:0 auto;padding:24px;max-width:600px;">
      <tbody><tr style="width:100%"><td>
        <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
          style="margin-top:8px;margin-bottom:32px;text-align:center;">
          <tbody><tr><td>
            <img alt="{{site_name}}" height="40" src="{{site_logo_url}}"
              style="margin:0 auto;display:block;outline:none;border:none;text-decoration:none;" width="120" />
          </td></tr></tbody>
        </table>
        <table align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
          <tbody><tr><td>
            <h1 style="font-size:24px;font-weight:700;color:rgb(31,41,55);margin-bottom:16px;text-align:center;">${p.heading}</h1>
            <p style="font-size:16px;color:rgb(75,85,99);margin-bottom:24px;line-height:24px;margin-top:16px;">${p.body}</p>
            ${buttonOrCode}
            <p style="font-size:16px;color:rgb(75,85,99);margin-bottom:24px;line-height:24px;margin-top:16px;">${p.footerText}</p>
          </td></tr></tbody>
        </table>
      </td></tr></tbody>
    </table>
    <!--7--><!--/$-->
  </body>
</html>`;
}
