//ASN Path analytics
class ASNPathAnalytics{
  constructor(opts){
    this.dom = $(opts.divid);
    this.rand_id=parseInt(Math.random()*100000);
    this.default_selected_time = opts.new_time_selector;
    this.tzadj = window.trisul_tz_offset  + (new Date()).getTimezoneOffset()*60 ;
    this.cgguid = "{47F48ED1-C3E1-4CEE-E3FA-E768558BC07E}";
    if(opts.jsparams){
      this.cgguid = opts.jsparams.crosskey_interface || "{47F48ED1-C3E1-4CEE-E3FA-E768558BC07E}";
    }
    load_css_file(opts);
    this.remove_topper_count=0;
    this.max_crosskey_nodes=30;
    this.add_form();
    this.dash_params = opts.dash_params;
    
  }

  async add_form(){
    this.form=$("<div class='row pathanalytics_form'> <div class='col-xs-12'> <form class='form-horizontal'> <div class='row'> <div class='col-xs-6'> <div class='form-group'> <label class='control-label col-xs-4'>Routers</label> <div class='col-xs-8'> <select name='routers'></select> </div> </div> </div> <div class='col-xs-6'> <div class='form-group'> <div class='new_time_selector'></div> </div> </div> </div> <div class='row'> <div class='col-xs-6'> <div class='form-group'> <label class='control-label col-xs-4'>Interfaces</label> <div class='col-xs-8'> <select name='interfaces'></select> </div> </div> </div> <div class='col-xs-6'> <div class='from-group'> <label class='control-label col-xs-4'>Filter ASN</label> <div class='col-xs-8'> <input class='filter_asn' type='text'> <span class='help-block text-left'>Please enter AS Number to filter the result</span> </div> </div> </div> </div> <div class='row'> <div class='col-xs-6'> <div class='form-group'> <label class='control-label col-xs-4'>Remove Toppers</label> <div class='col-xs-8' style='padding-top:10px'> <div id='slider-remove-topn'> <div class='ui-slider-handle' id='remove-top-n'></div> </div> <span class='help-block text-left'>Remove the top N flows from view to reveal the smaller flows</span> </div> </div> </div> <div class='col-xs-6'> <div class='form-group'> <label class='control-label col-xs-4'>Show max nodes</label> <div class='col-xs-8' style='padding-top:10px'> <div id='slider-max-nodes'> <div class='ui-slider-handle' id='max-nodes'></div> </div> <span class='help-block text-left'>Show approximately these many nodes on the sankey (default 30)</span> </div> </div> </div> </div> <div class='row'> <div class='col-xs-10 col-md-offset-4' style='padding-top:10px'> <input name='from_date' type='hidden'> <input name='to_date' type='hidden'> <input class='btn-submit' id='btn_submit' name='commit' type='submit' value='Submit'> </div> </div> </form> </div> </div>");
    //we are updating router and meter based on id.
    this.form.find("select[name*='routers']").attr("id","routers_"+this.rand_id);
    this.form.find("select[name*='interfaces']").attr("id","interfaces_"+this.rand_id);
    this.form.find("input[name*='from_date']").attr("id","from_date_"+this.rand_id);
    this.form.find("input[name*='to_date']").attr("id","to_date_"+this.rand_id);
    this.form.find(".new_time_selector").attr("id","new_time_selector_"+this.rand_id);
    this.dom.append(this.form);
    //new time selector 
    let update_ids = "#from_date_"+this.rand_id+","+"#to_date_"+this.rand_id;
    new ShowNewTimeSelector({divid:"#new_time_selector_"+this.rand_id,
                               update_input_ids:update_ids,
                               default_ts:this.default_selected_time
                            });

    //loading router and interface in dropdown
    //get interface search key request
    this.mk_time_interval();
    await this.load_routers_interfaces();
    await this.get_cgmeters();

    let cthis = this;
    $( "#slider-remove-topn" ).slider({
      min: 0, max: 10, value:0, step:1,
      create: function() {
         $( "#remove-top-n" ).text( $( this ).slider( "value" ) );
      },
      slide: function( event, ui ) {
         $( "#remove-top-n" ).text( ui.value );
        cthis.remove_topper_count=ui.value;
        cthis.draw_sankey_chart(cthis.data[0],"upload");
        cthis.draw_sankey_chart(cthis.data[1],"download");
      }
    });

   
    $( "#slider-max-nodes" ).slider({
      min: 20, max: 100, value:30, step:10,
      create: function() {
        $( "#max-nodes" ).text( $( this ).slider( "value" ) );
      },
      slide: function( event, ui ) {
        $( "#max-nodes" ).text( ui.value );
        cthis.max_crosskey_nodes=ui.value;
        cthis.draw_sankey_chart(cthis.data[0],"upload");
        cthis.draw_sankey_chart(cthis.data[1],"download");
      }
    });
    this.form.submit($.proxy(this.submit_form,this));
    if(this.dash_params.valid_input == "1" || this.dash_params.valid_input==1){
      this.form.submit();
    }
  }
  async load_routers_interfaces(){
    //get routers from keyspace request
    let top_routers=await fetch_trp(TRP.Message.Command.KEYSPACE_REQUEST, {
      counter_group: GUID.GUID_CG_FLOWGENS(),
      time_interval:this.tmint,
      maxitems:1000
    });

    this.router_keymap ={}
    _.each(top_routers.hits,function(keyt){
      this.router_keymap[keyt.key] = keyt.label || keyt.readable;
    },this);


    let top_intfs=await fetch_trp(TRP.Message.Command.KEYSPACE_REQUEST, {
      counter_group: GUID.GUID_CG_FLOWINTERFACE(),
      time_interval:this.tmint,
      maxitems:1000
    });

    this.intf_keymap ={}
    _.each(top_intfs.hits,function(keyt){
      this.intf_keymap[keyt.key] = keyt.label || keyt.readable;
    },this);

    let drop_down_items = {"0":["Please select",[["0","Please select"]]]};

    let interface_keys = _.sortBy(top_intfs.hits,function(keyt) { return keyt.key })
    for(let i=0;i<interface_keys.length; i++){
      let intf_keyt = interface_keys[i];
      let router_key=intf_keyt.key.split("_")[0];
      let router_label = this.router_keymap[router_key];
      let intf_dropdown = [];
      if(_.has(drop_down_items,router_key)){
        intf_dropdown= drop_down_items[router_key];
      }else{
        drop_down_items[router_key]=[router_label,[["0","Please Select"]]];
        intf_dropdown = drop_down_items[router_key];
      }
      intf_dropdown[1].push([intf_keyt.key,this.intf_keymap[intf_keyt.key]]);
    }
    let incoming_key = this.dash_params.key || ""
    incoming_key = incoming_key.split(/\\/);
    let selected_cg = "";
    let selected_st = "0";
    if(incoming_key.length == 2){
      this.form.find(".filter_asn").val(incoming_key[0]);
      let rout_intf = incoming_key[1].split("_");
      if(rout_intf.length == 2){
        selected_cg = rout_intf[0];
        selected_st = incoming_key[1];
      }else{
        selected_cg  = rout_intf[0];
      }
    }
    else if (incoming_key.length == 1){
      this.form.find(".filter_asn").val(incoming_key[0]);
    }
    var js_params = {meter_details:drop_down_items,
      selected_cg : selected_cg,
      selected_st : selected_st,
      update_dom_cg : "routers_"+this.rand_id,
      update_dom_st : "interfaces_"+this.rand_id,
      chosen:true
    }
    new CGMeterCombo(JSON.stringify(js_params));
  }
  async get_cgmeters(){
    this.cg_meters={};
    await get_counters_and_meters_json(this.cg_meters);
  }
  mk_time_interval(){
    var selected_fromdate = $('#from_date_'+this.rand_id).val();
    var selected_todate = $('#to_date_'+this.rand_id).val();
    var fromTS = parseInt((new Date(selected_fromdate).getTime()/1000)-this.tzadj);
    var toTS = parseInt((new Date(selected_todate).getTime()/1000)-this.tzadj);
    this.tmint = mk_time_interval([fromTS,toTS]);
  }

  submit_form(){
    this.reset_ui();
    this.mk_time_interval();
    this.get_data();
    return false;
  }
 
  reset_ui(){
    this.dom.find(".path_data").html('');
    this.data_dom = $("<div class='path_data'> <div class='row'> <div class='col-xs-12'> <div class='panel panel-info'> <div class='panel-body'> <div class='col-xs-12 toppers_table_div'> <h3 class='noitify'> <i class='fa fa-spinner fa-spin'></i> Please wait .... Getting data .....  </h3> <h2> <i class='fa fa-table'></i> Busiest Routes <small> Shows the top used AS PATHS </small> </h2> <div class='toppers_table'> <table> <thead></thead> <tbody></tbody> </table> </div> </div> <div class='col-xs-12 sankey_asn_upload sankey_chart'> <h2> <i class='fa fa-random'></i> Route Per Hop Analytics - Transmit <small> Usage of busiest route segments </small> </h2> <div class='sankey_chart_upload'></div> </div> <div class='col-xs-12 sankey_asn_download sankey_chart'> <h2> <i class='fa fa-random'></i> Route Per Hop Analytics - Receive <small> Usage of busiest route segments - Download </small> </h2> <div class='sankey_chart_download'></div> </div> </div> </div> </div> </div> </div>");
    this.dom.append(this.data_dom);
    this.data_dom.find('.toppers_table_div').attr("id","toppers_table_"+this.rand_id);
    this.data_dom.find(".sankey_chart_upload").attr("id","sankey_chart_upload_"+this.rand_id);
    this.data_dom.find(".sankey_chart_download").attr("id","sankey_chart_download_"+this.rand_id);
  }
  async get_data(){
    this.data ={};
    this.bucket_size = this.cg_meters.all_cg_bucketsize[this.cgguid].top_bucket_size;

    let req_opts = {
      counter_group: this.cgguid,
      time_interval: this.tmint,
      maxitems:100,
    }
    let selected_interface = $('#interfaces_'+this.rand_id).val();
    let selected_router = $('#interfaces_'+this.rand_id).val();
    let filter_asn = this.form.find(".filter_asn").val();

    if(selected_interface != 0)
    {
      req_opts["key_filter"]= selected_interface;
    }else if(selected_router !=0){
      req_opts["key_filter"]= selected_router;
    }
    if(filter_asn.length > 0){
      req_opts["key_filter"] = filter_asn;
    }
    req_opts["meter"] = 0;
    this.data[0]=await fetch_trp(TRP.Message.Command.COUNTER_GROUP_TOPPER_REQUEST,req_opts );
    req_opts["meter"] = 1;
    this.data[1]=await fetch_trp(TRP.Message.Command.COUNTER_GROUP_TOPPER_REQUEST,req_opts);
    //key_filter in trp support one like 
    //we can't combine router with asn to make key filter
    //so support added via code.
    let filter_value = ".*";
    if(selected_router && filter_asn){
      filter_value = selected_router;
    }else if(selected_interface && filter_asn){
      filter_value = selected_interface
    }
    //resove asn path to label
    let asn_keys=await fetch_trp(TRP.Message.Command.KEYSPACE_REQUEST, {
      counter_group: GUID.GUID_CG_ASN(),
      time_interval:this.tmint,
      maxitems:10000
    });

    let asn_keymap = {}
    _.each(asn_keys.hits,function(keyt){
      asn_keymap[keyt.key] = keyt.label || keyt.readable;
    },this);

    for(let meterid in this.data){
      this.data[meterid].keys = _.chain(this.data[meterid].keys)
                                .select(function(topper){
                                  return topper.key.match(filter_value)
                                })
                                .reject(function(topper){
                                  return topper.key=="SYS:GROUP_TOTALS"
                                })
                                .each(function(keyt){
                                  //remove repated asn in single path
                                  let readable = keyt.readable.split(/\/|\\/);
                                  let intf = _.last(readable);
                                  if(intf.match(/^[0-9]*$/)){
                                    intf=readable.shift();
                                  }else{
                                    intf=readable.pop();
                                  }
                                  let asn_path = _.unique(readable);
                                  let asn_resolved = asn_path.map(x=> asn_keymap[x] || x).join("\\")
                                  keyt.label=[intf,asn_resolved].join("\\");
                                  keyt.readable=[intf,asn_path.join("\\")].join("\\");
                                },this)
                              .value();
    }
    
    this.draw_table();
    this.draw_sankey_chart(this.data[0],"upload")
    this.draw_sankey_chart(this.data[1],"download")
    
  }


  draw_table(){
    let table_data = {}
    for(let meterid in this.data){
       meterid = parseInt(meterid);
      for(let i=0;i<this.data[meterid].keys.length;i++){
        let keyt = this.data[meterid].keys[i];
        let label = keyt.label;
        if(table_data[label]==undefined){
          table_data[label] = [keyt.key,keyt.readable,label,0,0]
        }
        table_data[label][meterid+3]=table_data[label][meterid+3] + (keyt.metric.toNumber()*this.bucket_size)
      }
    }
    this.dom.find('.noitify').remove();
    let rows = [];
    var table = this.data_dom.find(`#toppers_table_${this.rand_id}`).find(".toppers_table").find("table");
    this.table_id = `table_${this.rand_id}`;
    table.attr("id",this.table_id)
    table.addClass('table table-hover table-sysdata');
    table.find("thead").append(`<tr><th>ASN Path</th><th style='width:400px'>Label</th><th sort='volume'>Upload </th><th sort='volume'>Download</th></tr>`);
    let cgtoppers =  Object.values(table_data).slice(0,100);
    for(let i= 0 ; i < cgtoppers.length  ; i++){
      let topper = cgtoppers[i];
      rows.push(`<tr data-key="${topper[0]}"  data-label="${topper[2]}" data-readable="${topper[1]}">
                                <td class='linkdrill'>${topper[1]}</a></td>
                                <td class='linkdrill'>${topper[2]}</a></td>
                                <td>${h_fmtvol(topper[3])}</td>
                                <td>${h_fmtvol(topper[4])}</td>
                                </tr>`);


    }
    new TrisTablePagination(this.table_id,{no_of_rows:10,rows:rows});
    table.tablesorter();

  }

  draw_sankey_chart(toppers,id){
    this.sankey_div_id = `sankey_chart_${id}_${this.rand_id}`;
    let cgtoppers_bytes = toppers.keys.slice(this.remove_topper_count,this.max_crosskey_nodes);
    let keylookup = {};
    let idx=0;
    let links  = { source : [], target : [], value : [] };

    for (let i =0 ; i < cgtoppers_bytes.length; i++)
    {   
      //change label to :0,:1,:2
      //http host and host has same lable 
      let k=cgtoppers_bytes[i].label;
      let parts=k.split("\\");

      
      parts = _.map(parts,function(ai,ind){
        return ai.replace(/:0|:1|:2|:3|:4|:5|:6|:7|:8|:9/g,"")+":"+ind;
      });
      cgtoppers_bytes[i].label=parts.join("\\")
      keylookup[parts[0]] = keylookup[parts[0]]==undefined ? idx++ : keylookup[parts[0]];
      keylookup[parts[1]] = keylookup[parts[1]] || idx++;
      for(let i=2 ; i < parts.length;i++){
        if (parts[i]) {
          keylookup[parts[i]] = keylookup[parts[i]] || idx++;
        }
      }
        
    }


    for (let i =0 ; i < cgtoppers_bytes.length; i++)
    {
      let item=cgtoppers_bytes[i];
      let k=item.label;
      let parts=k.split("\\");
       for(let j=1;j < parts.length; j++){
        links.source.push(keylookup[parts[j-1]]);
        links.target.push(keylookup[parts[j]]);
        links.value.push(parseInt(item.metric*this.bucket_size))
      }

    }
    let labels=_.chain(keylookup).pairs().sortBy( (ai) => ai[1]).map( (ai) => ai[0].replace(/:0|:1|:2|:3|:4|:5|:6|:7|:8|:9/g,"")).value()
    Plotly.purge(this.sankey_div_id);
    var data = {
      type: "sankey",
      orientation: "h",
      valuesuffix: "B",
      node: {
        pad: 15,
        thickness: 30,
        line: {
          color: "black",
          width: 0.5
        },
        label: labels,
      },

      link: links
    }

    //width of div widht
    var width = this.data_dom.find(".sankey_chart").width();
    width = parseInt(width)-50;
    var height = labels.length *50;
    if(height < 500){
      height =500;
    }
    var layout = {
      title: '',
      width:width,
      height:height,
      font: {
        size: 10
      },
      
    }

    var data = [data]
    var ploty_options = { modeBarButtonsToRemove: ['hoverClosestCartesian','toggleSpikelines','hoverCompareCartesian',
                               'sendDataToCloud'],
                          showSendToCloud:false,
                          responsive: true };

    Plotly.react(this.sankey_div_id, data, layout, ploty_options)
  }

}
 
 function run(opts){
  new ASNPathAnalytics(opts)
 }

//# sourceURL=path_analytics.js


// HAML for from
/*
.row.pathanalytics_form
  .col-xs-12
    %form.form-horizontal
      .row
        .col-xs-6 
          .form-group 
            %label.control-label.col-xs-4 Routers          
            .col-xs-8 
              %select{name:'routers'} 
        .col-xs-6
          .form-group
            .new_time_selector
       
          
      .row
        .col-xs-6
          .form-group 
            %label.control-label.col-xs-4 Interfaces          
            .col-xs-8 
              %select{name:'interfaces'} 
        .col-xs-6
          .from-group
            %label.control-label.col-xs-4 Filter ASN
            .col-xs-8
              %input{type:"text",class:"filter_asn"}
              %span.help-block.text-left Please enter AS Number to filter the result
      .row
        .col-xs-6
          .form-group
            %label.control-label.col-xs-4 Remove Toppers
            .col-xs-8{style:"padding-top:10px"}
              #slider-remove-topn
                %div#remove-top-n.ui-slider-handle
              %span.help-block.text-left Remove the top N flows from view to reveal the smaller flows
        .col-xs-6
          .form-group
            %label.control-label.col-xs-4 Show max nodes
            .col-xs-8{style:"padding-top:10px"}
              #slider-max-nodes
                %div#max-nodes.ui-slider-handle
              %span.help-block.text-left Show approximately these many nodes on the sankey (default 30)

      .row
        .col-xs-10.col-md-offset-4{style:"padding-top:10px"}
          %input{type:"hidden",name:"from_date"}
          %input{type:"hidden",name:"to_date"}
          %input.btn-submit{id:"btn_submit",name:"commit",type:"submit",value:"Submit"}
*/

/*
.path_data
  .row
    .col-xs-12
      .panel.panel-info
        .panel-body
          .col-xs-12.toppers_table_div
            %h3.noitify
              %i.fa.fa-spinner.fa-spin
              Please wait .... Getting data .....
            %h2 
              %i.fa.fa-table
              Busiest Routes
              %small
                Shows the top used AS PATHS 
            .toppers_table
              %table
                %thead
                %tbody
          .col-xs-12.sankey_asn_upload.sankey_chart
            %h2 
              %i.fa.fa-random
              Route Per Hop Analytics - Transmit 
              %small
                Usage of busiest route segments
            .sankey_chart_upload
          .col-xs-12.sankey_asn_download.sankey_chart
            %h2 
              %i.fa.fa-random
              Route Per Hop Analytics - Receive
              %small
                Usage of busiest route segments - Download 
            .sankey_chart_download
            
*/