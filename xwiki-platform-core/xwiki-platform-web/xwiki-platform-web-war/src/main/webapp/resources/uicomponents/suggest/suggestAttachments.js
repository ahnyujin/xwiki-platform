/*
 * See the NOTICE file distributed with this work for additional
 * information regarding copyright ownership.
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
 */
/*!
#set ($paths = {
  'xwiki-selectize': $xwiki.getSkinFile('uicomponents/suggest/xwiki.selectize.js', true)
})
#set ($discard = "#mimetypeimg('' '')")
#set ($discard = $mimetypeMap.put('attachment', ['attach', 'attachment']))
#foreach ($map in [$mimetypeMap, $extensionMap])
  #foreach ($entry in $map.entrySet())
    #set ($discard = $entry.value.set(0, $services.icon.getMetaData($entry.value.get(0))))
    #set ($translationKey = "core.viewers.attachments.mime.$entry.value.get(1)")
    #set ($discard = $entry.value.set(1, $services.localization.render($translationKey)))
  #end
#end
#set ($l10nBundle = {
  'upload': $services.localization.render('web.uicomponents.suggest.attachments.upload'),
  'uploading': $services.localization.render('web.uicomponents.suggest.attachments.uploading', ['{0}']),
  'uploadDone': $services.localization.render('web.uicomponents.suggest.attachments.uploadDone', ['{0}']),
  'uploadFailed': $services.localization.render('web.uicomponents.suggest.attachments.uploadFailed', ['{0}'])
})
#[[*/
// Start JavaScript-only code.
(function(paths, contextPath, mimeTypeMap, extensionMap, l10nBundle) {
  "use strict";

require.config({paths});

define('xwiki-attachments-store', ['jquery'], function($) {
  /**
   * Returns the REST URL that can be used to search or retrieve the attachments located inside the specified entity.
   */
  var getAttachmentsRestURL = function(entityReference, parameters) {
    var path = [contextPath, 'rest'];
    entityReference.getReversedReferenceChain().forEach(function(reference) {
      var restResourceType = reference.type === XWiki.EntityType.DOCUMENT ? 'page' :
        XWiki.EntityType.getName(reference.type);
      path.push(restResourceType + 's', encodeURIComponent(reference.name));
    });
    // If the specified entity is an attachment then return the URL to retrieve the attachment metadata.
    if (entityReference.type === XWiki.EntityType.ATTACHMENT) {
      path.push('metadata');
    } else {
      path.push('attachments');
    }
    var queryString = $.param($.extend({
      prettyNames: true
    }, parameters), true);
    return path.join('/') + '?' + queryString;
  };

  var getAttachments = function(entityReference, options) {
    return $.getJSON(getAttachmentsRestURL(entityReference), options);
  };

  var attachFile = function(attachmentReference, file) {
    var formData = new FormData();
    formData.append('file', file);
    // We also send the file name as a separate field because parsing it from the Content-Disposition HTTP multipart
    // header is tricky when the file name contains special characters (unicode using UTF-8).
    formData.append('filename', attachmentReference.name);
    var deferred = $.Deferred();
    $.post({
      url: getAttachmentsRestURL(attachmentReference.parent, {
        // Create the page if it doesn't exist (it happens when editing a new page).
        createPage: true
      }),
      data: formData,
      // Needed in order to be able to submit FormData directly
      processData: false,
      // Let the browser handle the Content-Type header because it needs to add the boundary string to the
      // 'multipart/form-data' value so that the server knows how to parse the request body.
      contentType: false,
      // REST calls return XML by default
      dataType: 'json',
      xhr: function() {
        var xhr = $.ajaxSettings.xhr();
        xhr.upload && xhr.upload.addEventListener('progress', function(event) {
          if (event.lengthComputable) {
            deferred.notify({
              loaded: event.loaded,
              total: event.total,
              percent: Math.round(event.loaded * 100 / event.total)
            });
          }
        }, false);
        return xhr;
      }
    }).then(deferred.resolve.bind(deferred), deferred.reject.bind(deferred));
    return deferred.promise();
  };

  var createAttachment = function(attachmentReference, file) {
    var attachmentURL = new XWiki.Document(attachmentReference.parent).getURL('download') + '/' +
      encodeURIComponent(attachmentReference.name);
    var hierarchyItems = attachmentReference.getReversedReferenceChain().map(function(entityReference) {
      return {
        type: XWiki.EntityType.getName(entityReference.type),
        name: entityReference.name,
        label: entityReference.name
      };
    });
    var attachment = {
      id: XWiki.Model.serialize(attachmentReference),
      name: attachmentReference.name,
      xwikiRelativeUrl: attachmentURL,
      hierarchy: {
        items: hierarchyItems
      }
    };
    if (file) {
      $.extend(attachment, {
        mimeType: file.type,
        file: file
      });
    }
    return attachment;
  };

  return {
    get: getAttachments,
    upload: attachFile,
    create: createAttachment
  };
});

define('xwiki-attachments-icon', ['jquery'], function($) {
  var getAttachmentIcon = function(attachment) {
    if (typeof attachment.mimeType === 'string' && attachment.mimeType.substring(0, 6) === 'image/') {
      var url = attachment.xwikiRelativeUrl;
      // If the image URL is relative to the current page or is absolute (HTTP) then we can pass the icon width as a
      // query string parameter to allow the image to be resized on the server side.
      if (url.substring(0, 1) === '/' || url.substring(0, 7) === 'http://') {
        url += (url.indexOf('?') < 0 ? '?' : '&') + 'width=48';
      }
      var icon = {
        iconSetType: 'IMAGE',
        url: url
      };
      if (attachment.file) {
        // Show the icon using the local file while the file is being uploaded.
        icon.promise = readAsDataURL(attachment.file).then(function(dataURL) {
          icon.url = dataURL;
          return dataURL;
        });
      }
      return icon;
    } else {
      return getIcon(attachment.mimeType, attachment.name);
    }
  };

  var readAsDataURL = function(file) {
    return new Promise((resolve, reject) => {
      var fileReader = new FileReader();
      fileReader.onload = function(event) {
        resolve(event.target.result);
      };
      fileReader.readAsDataURL(file);
    });
  };

  var getIcon = function(mimeType, fileName) {
    var extension = fileName.substring(fileName.lastIndexOf('.') + 1);
    if (mimeTypeMap.hasOwnProperty(mimeType)) {
      return mimeTypeMap[mimeType][0];
    } else if (extensionMap.hasOwnProperty(extension)) {
      return extensionMap[extension][0];
    } else {
      var mimeTypePrefix = mimeType.substring(0, mimeType.indexOf('/') + 1);
      if (mimeTypeMap.hasOwnProperty(mimeTypePrefix)) {
        return mimeTypeMap[mimeTypePrefix][0];
      } else {
        return mimeTypeMap['attachment'][0];
      }
    }
  };

  var loadAttachmentIcon = function(attachment) {
    return new Promise((resolve, reject) => {
      if (attachment.icon.iconSetType === 'IMAGE') {
        var image = new Image();
        image.onload = function() {
          resolve(attachment);
        };
        image.src = attachment.icon.url;
      } else {
        // Nothing to load.
        resolve(attachment);
      }
    });
  };

  return {
    getIcon: getAttachmentIcon,
    loadIcon: loadAttachmentIcon
  };
});

define('xwiki-attachments-filter', ['jquery'], function($) {
  var filterAttachments = function(attachments, accept) {
    var allowedFileTypes = [];
    if (typeof accept === 'string') {
      allowedFileTypes = accept.split(/\s*,\s*/).filter(function(type) {
        return type.length > 0;
      });
    }
    // Filter the attachments by type.
    return attachments.filter(function(attachment) {
      return isAttachmentAllowed(attachment, allowedFileTypes);
    });
  };

  var isAttachmentAllowed = function(attachment, allowedFileTypes) {
    for (var i = 0; i < allowedFileTypes.length; i++) {
      var type = allowedFileTypes[i];
      if (type.substring(0, 1) === '.') {
        // Verify if the file name matches the allowed file name extension.
        if (attachment.name.substring(attachment.name.length - type.length) === type) {
          return true;
        }
      // Verify if the file media type contains the allowed media type.
      } else if (typeof attachment.mimeType === 'string' && attachment.mimeType.indexOf(type) >= 0) {
        return true;
      }
    }
    return allowedFileTypes.length === 0;
  };

  return {
    filter: filterAttachments
  };
});

define('xwiki-file-picker', ['jquery'], function($) {
  var pickLocalFiles = function(options) {
    return new Promise((resolve, reject) => pickLocalFilesPromise(options, {resolve, reject}));
  };

  var pickLocalFilesPromise = function(options, deferred) {
    // There's no clean way to detect when the file browser dialog is canceled so we must rely on a hack: catch
    // when the current window gets back the focus after the file browser dialog is closed, making sure the
    // listener is removed in case some files were selected. In some cases (e.g. Chrome on MacOS) the file browser
    // dialog is closed before the change event is fired so we need to wait a bit before notifying the cancel.
    var rejectTimeout;
    $(window).one('focus.filePicker', function(event) {
      // The file browser dialog was canceled. Wait a bit before rejecting the promise, in case the change event hasn't
      // been fired yet (1 second seems to do the job).
      rejectTimeout = setTimeout(function() {
        deferred.reject();
      }, 1000)
    });

    // Chrome doesn't fire the change event all the time if the file input is not attached to the DOM tree.
    var fileInput = $('<input type="file" class="hidden"/>').prop('multiple', !!options.multiple).appendTo('body');
    if (typeof options.accept === 'string') {
      // We have to replace image/ with image/* in order to meet the file input expectations.
      fileInput.attr('accept', options.accept.replace(/\/(\s*(,|$))/g, '/*$1'));
    }

    fileInput.on('change', function(event) {
      // The user has selected some files to upload. Make sure the promise is not rejected.
      $(window).off('focus.filePicker');
      clearTimeout(rejectTimeout);
      deferred.resolve(this.files);
      fileInput.remove();
    // Open the file browser dialog.
    }).click();
  };

  return {pickLocalFiles};
});

define('xwiki-l10n', ['jquery'], function($) {
  var withParams = function(translation) {
    return function() {
      var result = translation;
      $.each(arguments, function(index, value) {
        result = result.replace('{' + index + '}', value);
      });
      return result;
    };
  };

  return function(entries) {
    $.each(entries, function(key, value) {
      if (typeof value === 'string' && value.match(/{\d+}/)) {
        entries[key] = withParams(value);
      }
    });
    return entries;
  };
});

define('xwiki-suggestAttachments', [
  'jquery',
  'xwiki-attachments-store',
  'xwiki-attachments-icon',
  'xwiki-attachments-filter',
  'xwiki-file-picker',
  'xwiki-l10n',
  'xwiki-selectize'
], function($, attachmentsStore, attachmentsIcon, attachmentsFilter, filePicker, L10n) {
  var l10n = L10n(l10nBundle);

  var getSelectizeOptions = function(select) {
    return {
      maxOptions: 10,
      // The document where the selected values are saved and where new files are being uploaded. Stored attachment
      // references will be relative to this document.
      documentReference: select.data('documentReference'),
      // Where to look for attachments. The following is supported:
      // * "wiki:wikiName" look for attachments in the specified wiki
      // * "space:spaceReference" look for attachments in the specified space
      // * "document:documentReference" look for attachments in the specified document
      searchScope: select.data('searchScope'),
      // Whether or not to use the attachment name (instead of its relative reference) as value when the search scope is
      // limited to a specific document (if all the attachments are from the same document then the attachment name is
      // enough to identify an attachment, and there's no need to escape it as an entity reference).
      useAttachmentName: false,
      uploadAllowed: select.data('uploadAllowed') === 'true' || select.data('uploadAllowed') === true,
      // Indicates the type of files that can be selected or uploaded. The value is a comma separated list of:
      // * file name extensions (e.g. .png,.pdf)
      // * complete or partial media types (e.g. image/,video/mpeg)
      // If nothing is specified then no restriction is applied.
      accept: select.data('accept'),
      load: function(text, callback) {
        loadAttachments(text, this.settings).then(callback, callback);
      },
      loadSelected: function(text, callback) {
        loadAttachment(text, this.settings).then(callback, callback);
      },
      create: function(input, callback) {
        if (input.length > 0) {
          // Select the typed text.
          var data = {};
          data[this.settings.labelField] = input;
          data[this.settings.valueField] = input;
          return data;
        } else {
          createFromLocalFiles(this).then(callback, callback);
        }
      }
    };
  };

  var processOptions = function(options) {
    // Resolve the document reference relative to the current document reference.
    if (!options.documentReference || typeof options.documentReference === 'string') {
      options.documentReference = XWiki.Model.resolve(options.documentReference, XWiki.EntityType.DOCUMENT,
        XWiki.currentDocument.documentReference);
    }
    // Resolve the search scope.
    options.searchScope = resolveEntityReference(options.searchScope || 'wiki:' + XWiki.currentWiki);
    return options;
  };

  /**
   * Resolves an entity reference from a string representation of the form "entityType:entityReference".
   */
  var resolveEntityReference = function(typeAndReference) {
    if (typeof typeAndReference === 'string') {
      try {
        return XWiki.Model.resolve(typeAndReference, null, XWiki.currentDocument.documentReference);
      } catch (e) {
        return null;
      }
    }
    return typeAndReference;
  };

  var loadAttachments = function(text, options) {
    var searchScope = options.searchScope;
    // If the user didn't type any text and the specified document is inside the search scope then..
    if (text === '' && (!searchScope || options.documentReference.hasParent(searchScope))) {
      // ..take the default list of suggestions from the specified document (usually the current document).
      searchScope = options.documentReference;
    }
    return attachmentsStore.get(searchScope, {
      name: text,
      types: options.accept,
      number: options.maxOptions
    }).then(processAttachments.bind(null, options));
  };

  var loadAttachment = function(value, options) {
    var attachmentReference = getAttachmentReferenceFromValue(value, options);
    return attachmentsStore.get(attachmentReference)
      .then(processAttachment.bind(null, options))
      .then(function(attachment) {
        // An array is expected in xwiki.selectize.js
        return [attachment];
      });
  };

  /**
   * Adapt the JSON returned by the REST call to the format expected by the Selectize widget.
   */
  var processAttachments = function(options, response) {
    if (Array.isArray(response.attachments)) {
      return response.attachments.map(processAttachment.bind(null, options));
    } else {
      return [];
    }
  };

  var processAttachment = function(options, attachment) {
    var attachmentReference = XWiki.Model.resolve(attachment.id, XWiki.EntityType.ATTACHMENT);
    return {
      label: attachment.name,
      value: getAttachmentValueFromReference(attachmentReference, options),
      url: attachment.xwikiRelativeUrl,
      icon: attachmentsIcon.getIcon(attachment),
      hint: getAttachmentHint(attachment),
      data: attachment
    };
  };

  /**
   * Resolve the attachment reference from the value of the Selectize widget.
   */
  var getAttachmentReferenceFromValue = function(value, options) {
    if (options.useAttachmentName && options.searchScope && options.searchScope.type === XWiki.EntityType.DOCUMENT) {
      // The value is the attachment name.
      return new XWiki.AttachmentReference(value, options.searchScope);
    } else {
      // The value is the serialized (relative) attachment reference.
      return XWiki.Model.resolve(value, XWiki.EntityType.ATTACHMENT, options.documentReference);
    }
  };

  /**
   * Return the Selectize widget value that corresponds to the given attachment reference.
   */
  var getAttachmentValueFromReference = function(attachmentReference, options) {
    if (options.useAttachmentName && options.searchScope && options.searchScope.type === XWiki.EntityType.DOCUMENT) {
      // The value is the attachment name.
      return attachmentReference.name;
    // The value is the serialized (relative) attachment reference.
    } else if (attachmentReference.parent.equals(options.documentReference)) {
      // Relative to the parent document.
      return XWiki.Model.serialize(attachmentReference.relativeTo(options.documentReference));
    } else {
      // Relative to the root wiki.
      return XWiki.Model.serialize(attachmentReference.relativeTo(options.documentReference.getRoot()));
    }
  };

  var getAttachmentHint = function(attachment) {
    return attachment.hierarchy.items.filter(function(item) {
      return item.type === 'space' || (item.type === 'document' && item.name !== 'WebHome');
    }).map(function(item) {
      return item.label;
    }).join(' / ');
  };

  /**
   * Allow the user to upload a file when the input is empty. Otherwise, allow the user to select the typed value.
   */
  var addFileUploadSupport = function(selectize) {
    // Activate the styles needed to show the upload progress.
    (selectize.get$('wrapper')).addClass('async-create');

    // Show the Create option even when the input is empty in order to allow the user to upload files.
    var oldCanCreate = selectize.canCreate;
    selectize.canCreate = function(input) {
      return input.length === 0 || oldCanCreate.apply(this, arguments);
    };

    var oldCreate = selectize.settings.render.option_create;
    selectize.settings.render.option_create = function(data, escapeHTML) {
      if (data.input.length > 0) {
        // Allow the user to select the typed text.
        return oldCreate.apply(this, arguments);
      } else {
        // Allow the user to upload a file.
        return $('<div class="create upload option"></div>').text(l10n.upload);
      }
    };

    // Overwrite the way the selected items are displayed in order to show the upload progress.
    var oldRenderItem = selectize.settings.render.item;
    selectize.settings.render.item = function(attachment) {
      var output = oldRenderItem.apply(this, arguments);
      if (attachment.data && attachment.data.upload) {
        output.addClass('upload create-' + attachment.data.upload.status);
        if (attachment.data.upload.status === 'running') {
          output.css('background', 'linear-gradient(90deg, #dff0d8 ' +
            attachment.data.upload.progress.percent + '%, #efefef 0)');
        }
      }
      return output;
    };

    acceptDroppedFiles(selectize);
  };

  /**
   * Allow the user to select local files and upload them as attachments.
   */
  var createFromLocalFiles = function(selectize) {
    return filePicker.pickLocalFiles({
      accept: selectize.settings.accept,
      multiple: selectize.settings.maxItems !== 1
    }).then(selectAndUploadFiles.bind(null, selectize));
  };

  var selectAndUploadFiles = function(selectize, files) {
    var attachments = convertFilesToAttachments(files, selectize.settings);
    attachments = attachmentsFilter.filter(attachments, selectize.settings.accept);
    if (selectize.settings.maxItems === 1) {
      // Upload only a single file if single selecion is on.
      attachments = attachments.slice(0, 1);
    }
    attachments = processAttachments(selectize.settings, {attachments: attachments});
    // Add the attachments to the list of suggestions in order to be able to select them.
    selectize.addOption(attachments);
    // Uploading the files in parallel can cause problems, at least until XWIKI-13473 (Exception when the same document
    // is saved at the same time in 2 different threads) is fixed. Let's upload them sequentially for now.
    attachments.reduce((uploadQueue, attachment) => {
      // Select the attachments.
      selectize.addItem(attachment.value);
      // Use the local file as icon while the file is being uploaded.
      attachment.icon.promise && attachment.icon.promise.then(function() {
        selectize.updateOption(attachment.value, attachment);
      });
      var uploadNextFile = uploadFileAndShowProgress.bind(null, attachment, selectize);
      return uploadQueue.then(uploadNextFile, uploadNextFile);
    }, Promise.resolve());
    return attachments;
  };

  var convertFilesToAttachments = function(files, options) {
    var attachments = [];
    for (var i = 0; i < files.length; i++) {
      var file = files.item(i);
      var attachmentReference = new XWiki.EntityReference(file.name, XWiki.EntityType.ATTACHMENT,
        options.documentReference);
      attachments.push(attachmentsStore.create(attachmentReference, file));
    }
    return attachments;
  };

  var uploadFileAndShowProgress = function(attachment, selectize) {
    var attachmentName = $('<em></em>').text(attachment.label).prop('outerHTML');
    var notification = new XWiki.widgets.Notification(l10n.uploading(attachmentName), 'inprogress');
    attachment.data.upload = {
      status: 'pending',
      progress: {
        loaded: 0,
        total: attachment.data.file.size,
        percent: 0
      }
    };
    return uploadFile(attachment.data)
    .then(processAttachment.bind(null, selectize.settings))
    // Load the attachment icon before updating the display in order to reduce the flickering.
    .then(attachmentsIcon.loadIcon)
    .progress(data => {
      attachment.data.upload.status = 'running';
      attachment.data.upload.progress = data;
      selectize.updateOption(attachment.value, attachment);
    }).then(attachment => {
      attachment.data.upload = {status: 'done'};
      selectize.updateOption(attachment.value, attachment);
      notification.replace(new XWiki.widgets.Notification(l10n.uploadDone(attachmentName), 'done'));
      return attachment;
    }).catch(() => {
      attachment.data.upload.status = 'failed';
      selectize.updateOption(attachment.value, attachment);
      notification.replace(new XWiki.widgets.Notification(l10n.uploadFailed(attachmentName), 'error'));
      return Promise.reject();
    });
  };

  var uploadFile = function(attachment) {
    var attachmentReference = XWiki.Model.resolve(attachment.id, XWiki.EntityType.ATTACHMENT);
    return attachmentsStore.upload(attachmentReference, attachment.file);
  };

  var acceptDroppedFiles = function(selectize) {
    // Prevent any unwanted behaviors for the drag & drop events across browsers.
    (selectize.get$('wrapper')).on('drag dragstart dragend dragover dragenter dragleave drop', function(event) {
      event.preventDefault();
      event.stopPropagation();
    // Indicate visually that the user can drop the files.
    }).on('dragover dragenter', function() {
      $(this).addClass('is-dragover');
    }).on('dragleave dragend drop', function() {
      $(this).removeClass('is-dragover');
    // Filter the files based on their type and then upload them.
    }).on('drop', function(event) {
      var dataTransfer = event.originalEvent.dataTransfer;
      if (dataTransfer.files.length > 0) {
        selectAndUploadFiles(selectize, dataTransfer.files);
      } else {
        onDropHTML(selectize, dataTransfer.getData('text/html'));
      }
    });
  };

  var onDropHTML = function(selectize, html) {
    $(html).find('[data-entity-type="ATTACHMENT"][data-entity-reference]').each(function() {
      var attachmentReference = XWiki.Model.resolve($(this).data('entityReference'), XWiki.EntityType.ATTACHMENT);
      attachmentsStore.get(attachmentReference).then(attachment => {
        var attachments = processAttachments(selectize.settings, {
          attachments: attachmentsFilter.filter([attachment], selectize.settings.accept)
        });
        // Add the attachments to the list of suggestions in order to be able to select them.
        selectize.addOption(attachments);
        // Select the attachments.
        attachments.forEach(function(attachment) {
          selectize.addItem(attachment.value);
        });
      });
    });
  };

  /**
   * We want to show a bigger icon when there's a hint available. This is especially useful for image attachments
   * because their icon is a thumbnail.
   */
  var overwriteOptionRendering = function(selectize) {
    var oldRenderOption = selectize.settings.render.option;
    selectize.settings.render.option = function(attachment) {
      var output = oldRenderOption.apply(this, arguments);
      var hint = output.find('.xwiki-selectize-option-hint');
      if (selectize.settings.searchScope.type === XWiki.EntityType.DOCUMENT) {
        // The hint (attachment location) is redundant if all the attachments are from the same document.
        hint.remove();
      } else if (hint.length === 1) {
        // Show a bigger attachment icon.
        $('<div class="xwiki-selectize-option-label-wrapper"></div>')
          .append(output.find('.xwiki-selectize-option-label'))
          .append(hint)
          .appendTo(output);
        output.find('.xwiki-selectize-option-icon-wrapper').addClass('pull-left');
      }
      return output;
    };
  };

  $.fn.suggestAttachments = function(options) {
    return this.each(function() {
      var actualOptions = $.extend(getSelectizeOptions($(this)), options);
      $(this).xwikiSelectize(processOptions(actualOptions));
      if (this.selectize.settings.uploadAllowed) {
        addFileUploadSupport(this.selectize);
      }
      overwriteOptionRendering(this.selectize);
    });
  };
});

define('xwiki-attachmentResourcePicker', ['jquery', 'xwiki-suggestAttachments'], function($) {
  // Load the selected values only if they represent attachment resources.
  var overwriteLoadSelected = function() {
    adjustOptions(this.selectize);
    var oldLoadSelected = this.selectize.settings.loadSelected;
    this.selectize.settings.loadSelected = function(value, callback) {
      var option = this.options[value];
      if (!option || !option.data) {
        // Load attachment information.
        oldLoadSelected.apply(this, arguments);
      } else {
        // Nothing to load.
        callback(value);
      }
    }
  };

  // We need to remove the 'attach:' prefix from the selected values that represent attachment resources (before they
  // are loaded) because the attachment picker expects an attachment reference.
  var adjustOptions = function(selectize) {
    // Iterate the keys because we're going to modify the options map.
    Object.keys(selectize.options).forEach(function(value) {
      var option = selectize.options[value];
      var resourceReference = getResourceReference(value, selectize.settings.supportedResourceTypes);
      if (resourceReference.type === 'attach') {
        if (value !== resourceReference.reference) {
          // Update the option value to discard the 'attach:' prefix.
          option[selectize.settings.valueField] = resourceReference.reference;
          selectize.updateOption(value, option);
        }
      } else if (!option.data) {
        // Mark this option so that we don't load it from the server.
        option.data.resourceReference = resourceReference;
      }
    });
  };

  var getResourceReference = function(value, supportedResourceTypes) {
    var separatorIndex = value.indexOf(':');
    if (separatorIndex >= 0) {
      var type = value.substring(0, separatorIndex).toLowerCase();
      if (supportedResourceTypes.indexOf(type) >= 0) {
        return {type: type, reference: value.substring(separatorIndex + 1)};
      }
    }
    return {type: 'attach', reference: value};
  };

  $.fn.pickAttachmentResource = function(settings) {
    return this.on('initialize', overwriteLoadSelected).each(function() {
      var actualSettings = $.extend({
        supportedResourceTypes: $(this).data('supportedResourceTypes') || 'attach, data, url, path, unc'
      }, settings);
      if (typeof actualSettings.supportedResourceTypes === 'string') {
        actualSettings.supportedResourceTypes = actualSettings.supportedResourceTypes.split(/\s*,\s*/)
          .filter(function(type) {
            return type.length > 0;
          }).map(function(type) {
            return type.toLowerCase();
          });
      }
      $(this).suggestAttachments(actualSettings);
    });
  };
});

require(['jquery', 'xwiki-suggestAttachments', 'xwiki-attachmentResourcePicker', 'xwiki-events-bridge'], function($) {
  var init = function(event, data) {
    var container = $((data && data.elements) || document);
    container.find('.suggest-attachments').suggestAttachments();
    container.find('.pick-attachment-resource').pickAttachmentResource();
  };

  $(document).on('xwiki:dom:updated', init);
  $(init);
});

// End JavaScript-only code.
}).apply(']]#', $jsontool.serialize([$paths, $request.contextPath, $mimetypeMap, $extensionMap, $l10nBundle]));