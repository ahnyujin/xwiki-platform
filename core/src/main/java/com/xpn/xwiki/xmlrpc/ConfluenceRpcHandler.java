/*
 * Copyright 2006, XpertNet SARL, and individual contributors as indicated
 * by the contributors.txt.
 *
 * This is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * This software is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this software; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 *
 * @author sdumitriu
 */

package com.xpn.xwiki.xmlrpc;

import com.xpn.xwiki.XWiki;
import com.xpn.xwiki.XWikiContext;
import com.xpn.xwiki.XWikiException;
import com.xpn.xwiki.doc.XWikiAttachment;
import com.xpn.xwiki.doc.XWikiDocument;
import com.xpn.xwiki.objects.BaseObject;
import com.xpn.xwiki.web.Utils;
import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.apache.velocity.VelocityContext;
import org.suigeneris.jrcs.rcs.Version;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.*;

public class ConfluenceRpcHandler extends BaseRpcHandler implements ConfluenceRpcInterface {
	private static final Log log = LogFactory.getFactory().getInstance(ConfluenceRpcHandler.class);
	
    public class RemoteUser {

        public RemoteUser (String username, String ip) {
            this.ip = ip;
            this.username = username;
        }

        public String ip;
        public String username;
    }

    public String login(String username, String password) throws XWikiException {
        XWikiContext context = getXWikiContext();
        XWiki xwiki = context.getWiki();
        if (username.equals("guest")) {
            String ip = context.getRequest().getRemoteAddr();
            String token = getValidationHash("guest", "guest", ip);
            getTokens(context).put(token, new RemoteUser("XWiki.XWikiGuest", ip));
            return token;
        }   else if (xwiki.getAuthService().authenticate(username, password, context)!=null) {
            String ip = context.getRequest().getRemoteAddr();
            String token = getValidationHash(username, password, ip);
            getTokens(context).put(token, new RemoteUser("XWiki." + username, ip));
            return token;
        } else
            return null;
    }

    private Map getTokens(XWikiContext context) {
        Map tokens = (Map) context.getEngineContext().getAttribute("xmlrpc_tokens");
        if (tokens==null) {
            tokens = new HashMap();
            context.getEngineContext().setAttribute("xmlrpc_tokens", tokens);
        }
        return tokens;
    }

    private String getValidationHash(String username, String password, String clientIP) {
        String validationKey = "xmlrpcapi";
        MessageDigest md5 = null;
        StringBuffer sbValueBeforeMD5 = new StringBuffer();

        try {
            md5 = MessageDigest.getInstance("MD5");
        } catch (NoSuchAlgorithmException e) {
            System.out.println("Error: " + e);
        }

        try {
            md5 = MessageDigest.getInstance("MD5");
            sbValueBeforeMD5.append(username.toString());
            sbValueBeforeMD5.append(":");
            sbValueBeforeMD5.append(password.toString());
            sbValueBeforeMD5.append(":");
            sbValueBeforeMD5.append(clientIP.toString());
            sbValueBeforeMD5.append(":");
            sbValueBeforeMD5.append(validationKey.toString());

            String valueBeforeMD5 = sbValueBeforeMD5.toString();
            md5.update(valueBeforeMD5.getBytes());

            byte[] array = md5.digest();
            StringBuffer sb = new StringBuffer();
            for (int j = 0; j < array.length; ++j) {
                int b = array[j] & 0xFF;
                if (b < 0x10) sb.append('0');
                sb.append(Integer.toHexString(b));
            }
            String valueAfterMD5 = sb.toString();
            return valueAfterMD5;
        } catch (NoSuchAlgorithmException e) {
            System.out.println("Error: " + e);
        }
        catch (Exception ex) {
            log.error("Unhandled exception:", ex);
        }
        return null;
    }

    private void checkToken(String token, XWikiContext context) throws XWikiException {
        RemoteUser user = null;
        String ip = context.getRequest().getRemoteAddr();
        if (token != null)
             user = (RemoteUser)getTokens(context).get(token);
        if ((user==null)||(!user.ip.equals(ip))) {
            Object[] args = { token, ip };
            throw new XWikiException(XWikiException.MODULE_XWIKI_ACCESS, XWikiException.ERROR_XWIKI_ACCESS_TOKEN_INVALID,
                                     "Access Denied: authentification token {0} for ip {1} is invalid", null, args);
        }
        context.setUser(user.username);
    }

    public boolean logout(String token) throws XWikiException {
        XWikiContext context = getXWikiContext();

        // Verify authentication token
        checkToken(token, context);

        getTokens(context).remove(token);
        return true;
    }

    Map getServerInfo(String token) throws XWikiException {
        XWikiContext context = getXWikiContext();

        // Verify authentication token
        checkToken(token, context);

        return null;
    }

    public Object[] getSpaces(String token) throws XWikiException {
        XWikiContext context = getXWikiContext();
        XWiki xwiki = context.getWiki();

        // Verify authentication token
        checkToken(token, context);

        List webs = xwiki.search("select distinct doc.web from XWikiDocument doc", context);
        ArrayList spaces = new ArrayList(webs.size());
        for (int i=0; i<webs.size(); i++) {
            String web = (String)webs.get(i);
            SpaceSummary spacesum = new SpaceSummary(web, web, "http://127.0.0.1:9080/xwiki/bin/view/" + web + "/WebHome");
            spaces.add(spacesum.getHashtable());
        }
        return spaces.toArray();
    }

    public Map getSpace(String token, String spaceKey) throws XWikiException {
        XWikiContext context = getXWikiContext();

        // Verify authentication token
        checkToken(token, context);

        XWikiDocument doc = new XWikiDocument(spaceKey, "WebHome");
        return (new Space(spaceKey, spaceKey, doc.getURL("view", context), spaceKey, "WebHome")).getHashtable();
    }

    public Object[] getPages(String token, String spaceKey) throws XWikiException {
        XWikiContext context = getXWikiContext();
        XWiki xwiki = context.getWiki();

        // Verify authentication token
        checkToken(token, context);

        List docs = xwiki.getStore().searchDocumentsNames("where doc.web='" + Utils.SQLFilter(spaceKey) + "'", context);
        ArrayList pages = new ArrayList(docs.size());
        for (int i=0;i<docs.size();i++) {
            String docname = (String)docs.get(i);
            XWikiDocument doc = xwiki.getDocument(docname, context);
            PageSummary pagesum = new PageSummary(doc, context);
            pages.add(pagesum.getHashtable());
        }
        return pages.toArray();
    }

    public Map getPage(String token, String pageId) throws XWikiException {
        XWikiContext context = getXWikiContext();
        XWiki xwiki = context.getWiki();

        // Verify authentication token
        checkToken(token, context);

        XWikiDocument doc = xwiki.getDocument(pageId, context);
        Page page = new Page(doc, context);
        return page.getHashtable();
    }

    public Object[] getPageHistory(String token, String pageId) throws XWikiException {
        XWikiContext context = getXWikiContext();
        XWiki xwiki = context.getWiki();

        // Verify authentication token
        checkToken(token, context);

        XWikiDocument doc = xwiki.getDocument(pageId, context);
        Version[] versions = doc.getRevisions(context);
        ArrayList result = new ArrayList(versions.length);
        for (int i=0;i<versions.length;i++) {
            String version = versions[i].toString();
            XWikiDocument revdoc = xwiki.getDocument(doc, version, context);
            result.add((new PageHistorySummary(revdoc)).getHashtable());
        }
        return result.toArray();
    }

    public Object[] search(String token, String query, int maxResults) throws XWikiException {
        XWikiContext context = getXWikiContext();
        XWiki xwiki = context.getWiki();

        // Verify authentication token
        checkToken(token, context);

        List doclist = xwiki.getStore().searchDocumentsNames("where doc.content like '%" + Utils.SQLFilter(query) +
                "%' or doc.name like '%" + Utils.SQLFilter(query) + "%'", context);
        if (doclist == null)
            return new Object[0];

        List result = new ArrayList(doclist.size());
        for (int i=0;i<doclist.size();i++) {
            String docname = (String)doclist.get(i);
            XWikiDocument document = xwiki.getDocument(docname, context);
            SearchResult sresult = new SearchResult(document);
            result.add(sresult.getHashtable());
        }
        return result.toArray();
    }

    public String renderContent(String token, String spaceKey, String pageId, String content) {
        XWikiContext context = null;
        String result = "";
        try {
            context = getXWikiContext();
            XWiki xwiki = context.getWiki();
            context.setAction("view");

            // Verify authentication token
            checkToken(token, context);

            XWikiDocument document = xwiki.getDocument(pageId, context);
            context.setDoc(document);
            xwiki.prepareDocuments(context.getRequest(), context, (VelocityContext)context.get("vcontext"));
            result = xwiki.getRenderingEngine().renderText(content, document, context);
        } catch (Throwable e) {
            e.printStackTrace();
            result = handleException(e, context);
        }
        return result;
    }

    public Object[] getAttachments(String token, String pageId) throws XWikiException {
        XWikiContext context = null;
        context = getXWikiContext();
        XWiki xwiki = context.getWiki();
        context.setAction("view");

        // Verify authentication token
        checkToken(token, context);

        XWikiDocument document = xwiki.getDocument(pageId, context);
        context.setDoc(document);
        xwiki.prepareDocuments(context.getRequest(), context, (VelocityContext)context.get("vcontext"));

        List attachlist = document.getAttachmentList();
        ArrayList result = new ArrayList(attachlist.size());
        for (int i=0;i<attachlist.size();i++) {
            Attachment attach = new Attachment(document, (XWikiAttachment)attachlist.get(i), context);
            result.add(attach.getHashtable());
        }
        return result.toArray();
    }

    public Object[] getComments(String token, String pageId) throws XWikiException {
        XWikiContext context = null;
        context = getXWikiContext();
        XWiki xwiki = context.getWiki();
        context.setAction("view");

        // Verify authentication token
        checkToken(token, context);

        XWikiDocument document = xwiki.getDocument(pageId, context);
        context.setDoc(document);
        xwiki.prepareDocuments(context.getRequest(), context, (VelocityContext)context.get("vcontext"));

        List commentlist = document.getObjects("XWiki.XWikiComments");
        if (commentlist!=null) {
            ArrayList result = new ArrayList(commentlist.size());
            for (int i=0;i<commentlist.size();i++) {
                Comment comment = new Comment(document, (BaseObject)commentlist.get(i), context);
                result.add(comment);
            }
            return result.toArray();
        }
        return new Object[0];
    }

    public Map storePage(String token, Map pageht) throws XWikiException {
        try {
        Page page = new Page(new Hashtable(pageht));

        XWikiContext context = null;
        context = getXWikiContext();
        XWiki xwiki = context.getWiki();
        context.setAction("save");

        // Verify authentication token
        checkToken(token, context);

        XWikiDocument document = xwiki.getDocument(page.getId(), context);
        context.setDoc(document);
        xwiki.prepareDocuments(context.getRequest(), context, (VelocityContext)context.get("vcontext"));

        XWikiDocument newdoc = (XWikiDocument) document.clone();
        if (page.getParentId()!=null)
         newdoc.setParent(page.getParentId());

        newdoc.setAuthor(context.getUser());
        newdoc.setContent(page.getContent());
        context.getWiki().saveDocument(newdoc, document, context);
        return (new Page(newdoc, context)).getHashtable();
        } catch (XWikiException e) {
            e.printStackTrace();
            throw e;
        }
    }

    public void deletePage(String token, String pageId) throws XWikiException {
        XWikiContext context = null;
        context = getXWikiContext();
        XWiki xwiki = context.getWiki();
        context.setAction("delete");

        // Verify authentication token
        checkToken(token, context);

        XWikiDocument document = xwiki.getDocument(pageId, context);
        context.setDoc(document);
        xwiki.prepareDocuments(context.getRequest(), context, (VelocityContext)context.get("vcontext"));
        context.getWiki().deleteDocument(document, context);
    }

    public Map getUser(String token, String username) {
        return null;
    }

    public void addUser(String token, Map user, String password) {
    }

    public void addGroup(String token, String group) {
    }

    public Object[] getUserGroups(String token, String username) {
        return new Object[0];
    }

    public void addUserToGroup(String token, String username, String groupname) {
    }

    protected String handleException(Throwable e, XWikiContext context) {

        if (!(e instanceof XWikiException)) {
            e = new XWikiException(XWikiException.MODULE_XWIKI_APP, XWikiException.ERROR_XWIKI_UNKNOWN,
                    "Uncaught exception", e);
        }

        VelocityContext vcontext = ((VelocityContext)context.get("vcontext"));
        if (vcontext==null) {
            vcontext = new VelocityContext();
            context.put("vcontext", vcontext);
        }
        vcontext.put("exp", e);

        try {
            return parseTemplate("exception", context);
        } catch (Exception e2) {
            // I hope this never happens
            e.printStackTrace();
            e2.printStackTrace();
            return "Exception while serving request: " + e.getMessage();
        }
    }

    private String parseTemplate(String template, XWikiContext context) {
        context.setMode(XWikiContext.MODE_XMLRPC);
        String content = context.getWiki().parseTemplate(template + ".vm", context);
        return content;
    }

}
