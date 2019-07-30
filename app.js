require('dotenv').config();
var express = require("express");
var app = express();
var bodyParser=require("body-parser");
var request = require("request");
var flash = require("connect-flash");
var mongoose = require("mongoose");
var geo = require('mapbox-geocoding');
geo.setAccessToken("pk.eyJ1IjoiaGFyaXNoMTIxMyIsImEiOiJjanltMDJzZDAwM3FnM25tb2RpYXpwbzFjIn0.LPTK80kHmcW0JcajJ6EGlw");
var passport = require("passport");
var passportLocal = require("passport-local");
var passportLocalMoongoose = require("passport-local-mongoose");
var methodOverride = require("method-override");
var multer = require('multer');
var storage = multer.diskStorage({
  filename: function(req, file, callback) {
    callback(null, Date.now() + file.originalname);
  }
});
var imageFilter = function (req, file, cb) {
    // accept image files only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};
var upload = multer({ storage: storage, fileFilter: imageFilter});

var cloudinary = require('cloudinary');
cloudinary.config({ 
  cloud_name: 'dpsq9kzzu', 
  api_key: process.env.CLOUDAPI, 
  api_secret: process.env.CLOUDSECRET
});
app.use(methodOverride("_method"));
app.use(bodyParser.urlencoded({extended: true}));
app.set("view engine","ejs");
app.use(express.static("public"));
mongoose.set('useNewUrlParser', true);
mongoose.connect("mongodb://localhost/yelpcamp");
mongoose.set('useFindAndModify', false);
app.locals.moment = require('moment');
app.use(require("express-session")({
	secret:"trust no one",
	resave:false,
	saveUninitialized:false
}));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
app.use(function(req,res,next){
	res.locals.error=req.flash("error");
	res.locals.success=req.flash("success");
	next();
});
// user schema
userSchema = new mongoose.Schema({
	username:String,
	isAdmin:{type:Boolean,default:false},
	email:String,
	password:String
});
userSchema.plugin(passportLocalMoongoose);
var user = mongoose.model("user",userSchema);
passport.use(new passportLocal(user.authenticate()));
passport.serializeUser(user.serializeUser());
passport.deserializeUser(user.deserializeUser());

//comment schema
commentSchema = new mongoose.Schema({
	text:String,
	created:{type:Date,default:Date.now},
	author:{
		id:{type:mongoose.Schema.Types.ObjectId,
			ref:"user"},
	username:String
	}
});
var comment = mongoose.model("comment",commentSchema);

//campgroundschema
campgroundSchema = new mongoose.Schema ({
	name:String,
	image:String,
	image_id:String,
	description:String,
	created:{type:Date,default:Date.now()},
	comments:[{
		type:mongoose.Schema.Types.ObjectId,
		ref:"comment"
	}],
	author:{
			id:{type:mongoose.Schema.Types.ObjectId,
			ref:"user"},
		username:String
	},
	location:String,
	lat:Number,
	long:Number
});
campgroundSchema.pre('deleteOne', async function() {
	await comment.deleteMany({
		_id: {
			$in: this.comments
		}
	});
});
var campgrounds = mongoose.model("campgrounds",campgroundSchema); 

//routes
app.get("/",function(req,res){
	res.render("home");
});

app.get("/campgrounds/new",isloggedin,function(req,res){
	res.render("new");
});

app.get("/campgrounds/:id",function(req,res){
	campgrounds.findById(req.params.id).populate("comments").exec(function(err,campground){
		if (err || !campground) {
			req.flash("error","campground not found");
			res.redirect("/campgrounds");
			console.log(err);
		} else {
			res.render("single",{campground:campground,state:req.user});
		}
	});
});
app.post("/campgrounds/:id",isloggedin,function(req,res){
	var re = req.body.comment;
	var cr = {text:re};
	comment.create(cr,function(err,comment){
		campgrounds.findById(req.params.id,function(err,campground){
			if (err || !campground){
				req.flash("error","campground not found");
				res.redirect("/campgrounds");
				console.log(err);
			} else {
				comment.author.id=req.user._id;
				comment.author.username=req.user.username;
				comment.save();
				campground.comments.push(comment);
				campground.save(function(err,camp){
					if (err){
						console.log(err);	
					}else {
						res.redirect("/campgrounds/"+campground._id);
					}
				});
			}
		});
		
	});
});

app.get("/campgrounds",function(req,res){
	if (req.query.search){
		var regex = new RegExp(escapeRegex(req.query.search), 'gi');
		campgrounds.find({name:regex},function(err,allcampgrounds){
			if (err){
				console.log(err);
			}else {
				res.render("campgrounds",{campgrounds:allcampgrounds,state:req.user});
			}
		});	
	} else {
	campgrounds.find({},function(err,allcampgrounds){
		if (err){
			console.log(err);
		}else {
			var state = req.user;
			if (allcampgrounds){
				res.render("campgrounds",{campgrounds:allcampgrounds,state:state});
			} else {
				res.render("new");
			}
		}
	});
	}	
});
function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}
 
app.post("/campgrounds",isloggedin,upload.single('image'),function(req,res){
	campgrounds.create(req.body.form,function(err,campground){
		if (err){
			console.log(err);
		} else {
			campground.author.id=req.user._id;
			campground.author.username=req.user.username;
			campground.location=req.body.location;
			geo.geocode('mapbox.places', req.body.location, function (err, geoData) {
				campground.lat=geoData.features[0].center[1];
				campground.long=geoData.features[0].center[0];
				cloudinary.v2.uploader.upload(req.file.path, function(err,result){
					if (err){
						console.log(err);
					} else {
						campground.image=result.secure_url;
						campground.image_id=result.public_id;
						campground.save();
						req.flash("success","campground created successfully");
						res.redirect("/campgrounds");
					}
				});
			});
			campground.save();
		}
	});
});

			

app.get("/signin",function(req,res){
	res.render("signin");
});
app.get("/signup",function(req,res){
	res.render("signup");
});
app.post("/signup",function(req,res){
	var newuser = new user({username:req.body.username,email:req.body.email});
	if (req.body.secretcode===process.env.ADMINCODE){
		newuser.isAdmin = true;
	}
	
	user.register(newuser,req.body.password,function(err,user){
		if (err){
			req.flash("error",err.message);
			return res.redirect("/signup");
		}
		passport.authenticate("local")(req,res,function(){
			req.flash("success","signed up successfully Welcome "+req.user.username+"!");
			res.redirect("/campgrounds");
		});
	});
});
app.post("/signin",passport.authenticate("local",{
	successRedirect:"/signin/success",
	failureRedirect:"/signin/fail"
}),function(req,res){
	
});
app.get("/signin/fail",function(req,res){
		req.flash("error","username/password didn't match");
		res.redirect("/signin");
	});
app.get("/signin/success",function(req,res){
	req.flash("success","hi! "+req.user.username+" "+"welcome back");
	res.redirect("/campgrounds");
});
app.get("/signout",function(req,res){
	req.logout();
	req.flash("success","you are successfully logged out");
	res.redirect("/campgrounds");
});


app.get("/campgrounds/:id/edit",ownership,function(req,res){
	campgrounds.findById(req.params.id,function(err,campground){
		if (err){
			console.log(err);
		} else {
			res.render("edit",{campground:campground});
		}
	});
});
app.put("/campgrounds/:id",ownership,upload.single('image'),function(req,res){
	campgrounds.findByIdAndUpdate(req.params.id,{name:req.body.name,description:req.body.description,location:req.body.location},function(err,campground){
		if (err){
			req.flash("error",err.message);
			res.redirect("/campgrounds");
		}else {
			geo.geocode('mapbox.places', req.body.location, function (err, geoData) {
				campground.lat=geoData.features[0].center[1];
				campground.long=geoData.features[0].center[0];
				campground.save();
				if (req.file){
					cloudinary.v2.uploader.destroy(campground.image_id,function(err,result){
						if (err){
							console.log(err);
						}
						cloudinary.v2.uploader.upload(req.file.path,function(err,result){
							if (err){
								console.log(err);
							}else {
								campground.image=result.secure_url;
								campground.image_id=result.public_id;
								campground.save();
							}
						});
					});
				}
				req.flash("success","campground updated successfully");
				res.redirect("/campgrounds/"+campground._id);
			});
		}
	});
});

app.delete("/campgrounds/:id",ownership,function(req,res){
	campgrounds.findById(req.params.id,function(err,campground){
		if (err){
			console.log(err);
		}else {
			cloudinary.v2.uploader.destroy(campground.image_id,function(err,result){
				campground.deleteOne();
				req.flash("success","campground deleted successfully");
				res.redirect("/campgrounds");
			});

		}
	});
});

//comment edit routes
app.get("/campgrounds/:id/comments/:commentid",commentowner,function(req,res){
	campgrounds.findById(req.params.id,function(err,campground){
		if (err){
			console.log(err);
		}else {
			comment.findById(req.params.commentid,function(err,comment){
				if (err){
					console.log(err);
				} else {
					res.render("comment_edit",{comment:comment,campground:campground});		
				}
			});
		}
	});
});

app.put("/campgrounds/:id/comments/:commentid",commentowner,function(req,res){
	comment.findById(req.params.commentid,function(err,comment){
		if(err){
			console.log(err);
		} else {
			comment.text=req.body.text;
			comment.save();
			res.redirect("/campgrounds/"+req.params.id);
		}
	});
});

app.delete("/campgrounds/:id/comments/:commentid",commentowner,function(req,res){
	comment.findByIdAndRemove(req.params.commentid,function(err,comment){
		if (err){
			console.log(err);
		}else {
			campgrounds.findById(req.params.id,function(err,campground){
				if (err){
					console.log(err);
				}else {
					campground.comments.remove(req.params.commentid);
					campground.save();
					req.flash("success","comment deleted successfully");
					res.redirect("/campgrounds/"+req.params.id);
				}

			});

		}
	});
});

function isloggedin(req,res,next){
	if(req.isAuthenticated()){
		return next();
	}
	req.flash("error","you need to be logged in");
	res.redirect("/signin");
}

function ownership(req,res,next){
	if (req.isAuthenticated()){
		campgrounds.findById(req.params.id,function(err,campground){
			if(err || !campground){
				req.flash("error","campground not found");
				res.redirect("/campgrounds"+campground._id);
			} else {
				if (req.user.isAdmin || campground.author.id.equals(req.user._id)){
					return next();
				} else {
					req.flash("error","you are not allowed to do that");
					res.redirect("/campgrounds"+campground._id);
				}
			}
		});
	}
}

function commentowner(req,res,next){
	if (req.isAuthenticated()){
		comment.findById(req.params.commentid,function(err,comment){
			if (err || !comment){
				req.flash("error","comment not found");
				console.log(err);
			} else {
				if (comment.author.id.equals(req.user._id) || req.user.isAdmin){
					return next();	
				}else {
					req.flash("error","you cannot do that");
					res.redirect("/campgrounds");
				}
			}
		});
	}
}
 


app.listen(3000,console.log("server running"));